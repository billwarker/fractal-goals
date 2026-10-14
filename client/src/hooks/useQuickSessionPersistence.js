import { useCallback, useEffect, useState } from 'react';

import { useOutbox } from '../offline/OutboxContext';
import {
    clearQuickSessionDraft,
    loadQuickSessionDraft,
    saveQuickSessionDraft,
} from '../offline/quickSessionDraft';
import { SESSION_OP } from '../offline/opKinds';

const SAVE_DEBOUNCE_MS = 400;

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

/** True once the user has entered anything worth resuming. */
export function hasQuickSessionInput(draft) {
    return (draft?.activityInstances || []).some((instance) => (
        hasValue(instance.notes)
        || (instance.metrics || []).some((metric) => hasValue(metric.value))
        || (instance.sets || []).some((set) => set.completed || (set.metrics || []).some((metric) => hasValue(metric.value)))
    ));
}

/**
 * Keeps an in-progress quick session on the device and completes it through
 * the offline outbox, so neither a reload nor a dead zone loses the workout.
 */
export function useQuickSessionPersistence({ rootId, userId, draft, template }) {
    const outbox = useOutbox();
    const [savedDraft, setSavedDraft] = useState(null);

    useEffect(() => {
        let cancelled = false;
        loadQuickSessionDraft(userId, rootId).then((saved) => {
            if (!cancelled) setSavedDraft(saved);
        });
        return () => {
            cancelled = true;
        };
    }, [rootId, userId]);

    useEffect(() => {
        if (!draft || !template || !hasQuickSessionInput(draft)) return undefined;
        const timer = setTimeout(() => {
            void saveQuickSessionDraft(userId, rootId, { draft, template });
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [draft, rootId, template, userId]);

    const clearDraft = useCallback(() => {
        setSavedDraft(null);
        return clearQuickSessionDraft(userId, rootId);
    }, [rootId, userId]);

    /**
     * Queues the completion. Resolves to 'synced' when the server confirms within
     * ``waitMs``, 'queued' when it is still waiting for signal, 'rejected' when the
     * server refused it, or null when offline sync is unavailable.
     */
    const queueCompletion = useCallback(async (payload, { waitMs = 2500 } = {}) => {
        if (!outbox || !rootId) return null;
        const id = crypto.randomUUID();
        const { settled } = await outbox.submit({
            scope: id,
            kind: SESSION_OP.QUICK_COMPLETE,
            method: 'post',
            url: `/${rootId}/sessions/quick-complete`,
            body: { ...payload, id },
            creates: [id],
            meta: { rootId, sessionId: id, templateName: template?.name || null },
        });
        let timer;
        const outcome = await Promise.race([
            settled.then(() => 'synced', () => 'rejected'),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve('queued'), waitMs);
            }),
        ]);
        clearTimeout(timer);
        return outcome;
    }, [outbox, rootId, template?.name]);

    return { savedDraft, clearDraft, queueCompletion };
}

export default useQuickSessionPersistence;
