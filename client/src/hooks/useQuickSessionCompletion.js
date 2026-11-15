import { useCallback } from 'react';

import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { QUICK_SESSION_NAME } from '../utils/createSessionQuickDraft';

/** True once the draft holds anything to complete: an activity is enough. */
export function hasQuickSessionInput(draft) {
    return (draft?.items || []).length > 0;
}

/**
 * Completes a quick session through the offline outbox, device first, so a dead zone
 * never loses it. The draft itself lives only while Create Session is open.
 */
export function useQuickSessionCompletion({ rootId }) {
    const outbox = useOutbox();

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

    return { queueCompletion };
}

export default useQuickSessionCompletion;
