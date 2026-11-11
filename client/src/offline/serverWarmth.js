import { useSyncExternalStore } from 'react';

// Whether the API is answering slowly right now. On Cloud Run the first request after a quiet
// spell waits for an instance to start (up to ~20 s), and a slow mobile network looks the same
// from here, so loading states word it as "may be waking up" rather than claiming either.
// Only reads count: uploads and queued writes are slow for their own reasons.

export const SLOW_REQUEST_MS = 2500;

const listeners = new Set();
let slowRequests = 0;

function emit() {
    listeners.forEach((listener) => listener());
}

/** Start timing a request (axios request interceptor). */
export function trackRequest(config) {
    if (!config || (config.method && config.method.toLowerCase() !== 'get') || config._skipWarmth) return;
    // A retried request (after a token refresh) reuses its config: settle the first attempt.
    settleRequest(config);
    config._warmthTimer = setTimeout(() => {
        config._warmthTimer = null;
        config._countedSlow = true;
        slowRequests += 1;
        emit();
    }, SLOW_REQUEST_MS);
}

/** Stop timing a request that answered or failed (axios response interceptor). */
export function settleRequest(config) {
    if (!config) return;
    if (config._warmthTimer) {
        clearTimeout(config._warmthTimer);
        config._warmthTimer = null;
    }
    if (config._countedSlow) {
        config._countedSlow = false;
        slowRequests = Math.max(0, slowRequests - 1);
        emit();
    }
}

export function isServerSlow() {
    return slowRequests > 0;
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** True while at least one read has been waiting longer than SLOW_REQUEST_MS. */
export function useServerSlow() {
    return useSyncExternalStore(subscribe, isServerSlow, () => false);
}

export function resetServerWarmthForTests() {
    slowRequests = 0;
    listeners.clear();
}
