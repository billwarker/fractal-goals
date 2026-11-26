// Refreshes what is on screen when another device or tab changes the user's data. Runs only for a
// signed-in user, loaded with the sync engine.

import { isOnline, subscribeConnectivity } from '../offline/connectivity';
import { CLIENT_INSTANCE } from '../utils/api/core';
import { syncApi } from '../utils/api/syncApi';

export const POLL_MS = 15000;
const MAX_BACKOFF_MS = 2 * 60 * 1000;

// Cached reads that don't name their fractal but follow its data.
const UNSCOPED_PREFIXES = new Set(['progress', 'goalMetrics', 'analytics-engine', 'onboarding']);
// Not part of the synced data.
const UNAFFECTED_PREFIXES = new Set(['ai-agent', 'logs', 'feature-flags', 'storage', 'public', 'instagram-oembed']);

/** Whether a cached query may show something from a changed fractal. */
export function isAffected(queryKey, rootIds) {
    const [prefix] = queryKey;
    if (UNAFFECTED_PREFIXES.has(prefix)) return false;
    if (UNSCOPED_PREFIXES.has(prefix) || prefix === 'fractals') return true;
    return queryKey.some((part) => rootIds.has(part));
}

export function startChangeListener({ queryClient, hasPendingWrites }) {
    let cursor = null;
    let timer = null;
    let delay = POLL_MS;
    let running = false;
    let stopped = false;

    const canRun = () => !stopped && isOnline() && document.visibilityState === 'visible';

    const refresh = (changes) => {
        // A user-level row (a default goal level) names no fractal and can show in any of them.
        const everywhere = changes.some((change) => !change.root_id);
        const rootIds = new Set(changes.map((change) => change.root_id));
        void queryClient.invalidateQueries({
            predicate: ({ queryKey }) => isAffected(queryKey, rootIds)
                || (everywhere && !UNAFFECTED_PREFIXES.has(queryKey[0])),
        });
    };

    const poll = async () => {
        if (cursor === null) {
            cursor = (await syncApi.getCursor()).data.cursor;
            return;
        }
        const foreign = [];
        let next = cursor;
        let more = true;
        while (more && !stopped) {
            const { data } = await syncApi.getChangedIds(next);
            foreign.push(...data.changes.filter((change) => change.origin !== CLIENT_INSTANCE));
            next = data.cursor;
            more = data.has_more;
        }
        // A write queued meanwhile isn't on the server yet, so refetching now would undo it on screen.
        if (stopped || hasPendingWrites()) return;
        cursor = next;
        if (foreign.length > 0) refresh(foreign);
    };

    const schedule = () => {
        clearTimeout(timer);
        if (!stopped) timer = setTimeout(run, delay);
    };

    async function run() {
        clearTimeout(timer);
        if (running) return;
        if (!canRun()) return; // Becoming visible or online starts it again.
        if (hasPendingWrites()) {
            schedule();
            return;
        }
        running = true;
        try {
            await poll();
            delay = POLL_MS;
        } catch (error) {
            if (error?.response?.status === 410) {
                // Too far behind to list: take a new position first, so nothing after it is missed.
                cursor = null;
                try {
                    await poll();
                    void queryClient.invalidateQueries({
                        predicate: ({ queryKey }) => !UNAFFECTED_PREFIXES.has(queryKey[0]),
                    });
                } catch {
                    delay = Math.min(delay * 2, MAX_BACKOFF_MS);
                }
            } else {
                delay = Math.min(delay * 2, MAX_BACKOFF_MS);
            }
        } finally {
            running = false;
            schedule();
        }
    }

    const wake = () => {
        if (canRun()) void run();
    };
    const unsubscribe = subscribeConnectivity(wake);
    document.addEventListener('visibilitychange', wake);
    void run();

    return () => {
        stopped = true;
        clearTimeout(timer);
        unsubscribe();
        document.removeEventListener('visibilitychange', wake);
    };
}
