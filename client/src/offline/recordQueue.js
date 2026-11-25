// The part of offline record writes every page carries; the rest loads with the sync engine.

import { isOnline } from './connectivity';

/** One queue per fractal: a goal created offline reaches the server before its notes. */
export const recordScope = (rootId) => `fractal:${rootId}`;

/** With no signal, and until what was queued then has been sent, so order holds. */
export function shouldQueueRecord(outbox, rootId) {
    return Boolean(outbox) && (!isOnline() || outbox.hasPending(recordScope(rootId)));
}

/** The engine (loaded whenever there is an outbox) imports this too, so it resolves offline. */
export const loadRecordOps = () => import('./recordOps');
