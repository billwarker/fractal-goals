import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createAutoSaveQueue } from '../utils/autoSaveQueue';

function arraysEqual(left = [], right = []) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function areSessionSectionsEqual(left = [], right = []) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftSection = left[index] || {};
        const rightSection = right[index] || {};

        if (leftSection.name !== rightSection.name) return false;
        if (!arraysEqual(leftSection.activity_ids || [], rightSection.activity_ids || [])) return false;
    }

    return true;
}

function areSessionDataEqual(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
        if (!(key in right)) return false;
        if (key === 'sections') {
            if (!areSessionSectionsEqual(left.sections, right.sections)) return false;
            continue;
        }
        if (left[key] !== right[key]) return false;
    }

    return true;
}

export function useSessionDraftAutosave({
    rootId,
    sessionId,
    normalizedSessionData,
    saveSessionData,
    setAutoSaveStatus,
    scheduleStatusClear,
    instanceQueuesRef,
    instanceRollbackRef,
    setShowActivitySelector,
    setDraggedItem,
    setSidePaneMode,
}) {
    const [sessionDataDraft, setSessionDataDraft] = useState(null);
    const [justInitialized, setJustInitialized] = useState(false);
    const initializedRef = useRef(false);
    const previousSessionKeyRef = useRef(null);
    const initTimeoutRef = useRef(null);

    const updateSessionDataDraft = useCallback((updater) => {
        setSessionDataDraft((previous) => {
            const base = previous ?? normalizedSessionData;
            if (!base) return previous;
            return typeof updater === 'function' ? updater(base) : updater;
        });
    }, [normalizedSessionData]);

    /* eslint-disable react-hooks/refs, react-hooks/exhaustive-deps */
    const autoSaveQueue = useMemo(() => createAutoSaveQueue({
        save: (nextData) => saveSessionData(nextData),
        onError: () => {
            setAutoSaveStatus('error');
            scheduleStatusClear(3000);
        },
    }), [saveSessionData, scheduleStatusClear, setAutoSaveStatus]);
    /* eslint-enable react-hooks/refs, react-hooks/exhaustive-deps */

    useEffect(() => {
        const sessionKey = `${rootId || ''}:${sessionId || ''}`;
        if (previousSessionKeyRef.current !== sessionKey) {
            previousSessionKeyRef.current = sessionKey;
            initializedRef.current = false;
            setSessionDataDraft(null);
            autoSaveQueue.reset();
            instanceQueuesRef.current.forEach((queue) => queue.reset());
            instanceQueuesRef.current.clear();
            instanceRollbackRef.current.clear();
            setAutoSaveStatus('');
            setShowActivitySelector({});
            setDraggedItem(null);
            setSidePaneMode('details');
        }
    }, [
        autoSaveQueue,
        instanceQueuesRef,
        instanceRollbackRef,
        rootId,
        sessionId,
        setAutoSaveStatus,
        setDraggedItem,
        setShowActivitySelector,
        setSidePaneMode,
    ]);

    useEffect(() => {
        if (!normalizedSessionData || initializedRef.current) return;
        autoSaveQueue.seed(normalizedSessionData);
        initializedRef.current = true;
        setJustInitialized(true);
        if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = setTimeout(() => {
            setJustInitialized(false);
            initTimeoutRef.current = null;
        }, 500);
    }, [normalizedSessionData, autoSaveQueue]);

    useEffect(() => {
        if (!sessionDataDraft || !initializedRef.current || justInitialized) return;
        const timeoutId = setTimeout(() => {
            autoSaveQueue.enqueue(sessionDataDraft);
        }, 800);
        return () => clearTimeout(timeoutId);
    }, [sessionDataDraft, justInitialized, autoSaveQueue]);

    useEffect(() => {
        if (!sessionDataDraft || !normalizedSessionData) return;
        if (areSessionDataEqual(sessionDataDraft, normalizedSessionData)) {
            setSessionDataDraft(null);
        }
    }, [sessionDataDraft, normalizedSessionData]);

    useEffect(() => {
        const instanceQueues = instanceQueuesRef.current;
        return () => {
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            instanceQueues.forEach((queue) => queue.reset());
            instanceQueues.clear();
        };
    }, [instanceQueuesRef]);

    return {
        sessionDataDraft,
        setSessionDataDraft,
        localSessionData: sessionDataDraft ?? normalizedSessionData,
        updateSessionDataDraft,
    };
}

export default useSessionDraftAutosave;
