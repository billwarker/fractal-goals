import { dehydrate, hydrate } from '@tanstack/react-query';

import { idbDelete, idbGet, idbSet } from './idbKeyValue';

// Persists only what in-progress work needs with no signal: the session itself,
// its activities, circuits, notes and goal view, plus the activity and circuit
// catalogues (to add items) and session templates (to start a quick session).
// Everything is scoped to one user and expires after two days.

const PERSISTED_PREFIXES = new Set([
    'session',
    'session-activities',
    'circuit-runs',
    'session-notes',
    'session-goals-view',
    'activities',
    'activity-groups',
    'circuits',
    'session-templates',
]);
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const WRITE_THROTTLE_MS = 1000;
// Bump when a persisted query's data shape changes incompatibly.
const BUSTER = 'v1';

const storageKey = (userId) => `query-cache:${userId}`;

export function shouldPersistQuery(query) {
    return query.state.status === 'success' && PERSISTED_PREFIXES.has(query.queryKey?.[0]);
}

/** Hydrate the user's persisted session data. Returns true when something was restored. */
export async function restoreQueryCache(queryClient, userId, { now = Date.now() } = {}) {
    if (!userId) return false;
    const saved = await idbGet(storageKey(userId));
    if (!saved) return false;
    if (saved.buster !== BUSTER || now - saved.timestamp > MAX_AGE_MS) {
        await idbDelete(storageKey(userId));
        return false;
    }
    // Hydrate never overwrites data newer than the persisted copy.
    hydrate(queryClient, saved.state);
    return true;
}

export function clearPersistedQueryCache(userId) {
    return userId ? idbDelete(storageKey(userId)) : Promise.resolve();
}

/** Keep the persisted copy current while offline sync is on. Returns a stop function. */
export function startQueryPersistence(queryClient, userId) {
    let timer = null;
    const write = () => {
        timer = null;
        void idbSet(storageKey(userId), {
            buster: BUSTER,
            timestamp: Date.now(),
            state: dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery }),
        });
    };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (event?.type !== 'updated' || !PERSISTED_PREFIXES.has(event.query.queryKey?.[0])) return;
        timer ??= setTimeout(write, WRITE_THROTTLE_MS);
    });
    const flushOnHide = () => {
        if (document.visibilityState !== 'hidden' || !timer) return;
        clearTimeout(timer);
        write();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
        unsubscribe();
        document.removeEventListener('visibilitychange', flushOnHide);
        if (timer) {
            clearTimeout(timer);
            write();
        }
    };
}
