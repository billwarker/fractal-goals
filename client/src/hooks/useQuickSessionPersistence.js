import { useCallback, useEffect, useState } from 'react';

import { useOutbox } from '../offline/OutboxContext';
import {
    clearQuickSessionDraft,
    loadQuickSessionDraft,
    saveQuickSessionDraft,
} from '../offline/quickSessionDraft';
import { SESSION_OP } from '../offline/opKinds';
import { QUICK_SESSION_NAME } from '../utils/createSessionQuickDraft';

const SAVE_DEBOUNCE_MS = 400;

/** True once the draft holds anything worth resuming: an activity is enough. */
export function hasQuickSessionInput(draft) {
    return (draft?.items || []).length > 0;
}

/**
 * Keeps an in-progress quick session on the device and completes it through
 * the offline outbox, so neither a reload nor a dead zone loses the workout.
 */
export function useQuickSessionPersistence({ rootId, userId, draft }) {
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
        if (!draft) return undefined;
        const timer = setTimeout(() => {
            // Removing the last activity forgets the draft rather than saving an empty one.
            void (hasQuickSessionInput(draft)
                ? saveQuickSessionDraft(userId, rootId, { draft })
                : clearQuickSessionDraft(userId, rootId));
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [draft, rootId, userId]);

    const clearDraft = useCallback(() => {
        setSavedDraft(null);
        return clearQuickSessionDraft(userId, rootId);
    }, [rootId, userId]);

    /**
     * Queues the completion. Resolves to ``{ outcome, id }``: outcome is 'synced' when the
     * server confirms within ``waitMs``, 'queued' when it is still waiting for signal,
     * 'rejected' when the server refused it; null when offline sync is unavailable.
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
            meta: { rootId, sessionId: id, templateName: payload?.name || QUICK_SESSION_NAME },
        });
        let timer;
        const outcome = await Promise.race([
            settled.then(() => 'synced', () => 'rejected'),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve('queued'), waitMs);
            }),
        ]);
        clearTimeout(timer);
        return { outcome, id };
    }, [outbox, rootId]);

    return { savedDraft, clearDraft, queueCompletion };
}

export default useQuickSessionPersistence;
