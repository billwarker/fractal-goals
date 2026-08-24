import { useCallback, useEffect, useMemo, useState } from 'react';

import { readLocalStorageValue, writeLocalStorageValue } from './useFlowTreePreferences';

const STORAGE_KEY = 'create-session-preferences';
const STORAGE_VERSION = 1;

function normalizePreferences(rawValue) {
    if (!rawValue) return {};
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const optOut = parsed?.programScopeOptOut;
    if (!optOut || typeof optOut !== 'object' || Array.isArray(optOut)) return {};
    return Object.fromEntries(
        Object.entries(optOut)
            .filter(([, value]) => value === true)
            .map(([programId]) => [String(programId), true]),
    );
}

export function useCreateSessionPreferences({ rootId, userId }) {
    const [programScopeOptOut, setProgramScopeOptOut] = useState({});
    const [isHydrated, setIsHydrated] = useState(false);
    const storageKey = useMemo(
        () => rootId ? `${STORAGE_KEY}:${userId || 'anonymous'}:${rootId}` : null,
        [rootId, userId],
    );

    useEffect(() => {
        setIsHydrated(false);
        setProgramScopeOptOut({});
        if (!storageKey) {
            setIsHydrated(true);
            return;
        }
        try {
            setProgramScopeOptOut(normalizePreferences(readLocalStorageValue(storageKey)));
        } catch {
            setProgramScopeOptOut({});
        } finally {
            setIsHydrated(true);
        }
    }, [storageKey]);

    useEffect(() => {
        if (!storageKey || !isHydrated) return;
        writeLocalStorageValue(storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            programScopeOptOut,
        }));
    }, [isHydrated, programScopeOptOut, storageKey]);

    const isProgramScopeEnabled = useCallback(
        (programId) => Boolean(programId) && programScopeOptOut[String(programId)] !== true,
        [programScopeOptOut],
    );
    const setProgramScopeEnabled = useCallback((programId, enabled) => {
        if (!programId) return;
        setProgramScopeOptOut((current) => {
            const next = { ...current };
            if (enabled) delete next[String(programId)];
            else next[String(programId)] = true;
            return next;
        });
    }, []);

    return { isProgramScopeEnabled, setProgramScopeEnabled, isHydrated };
}
