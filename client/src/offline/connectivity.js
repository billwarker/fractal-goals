import { onlineManager } from '@tanstack/react-query';

import { axios } from '../utils/api/core';
import { globalApi } from '../utils/api/globalApi';
import { isNetworkError } from '../utils/networkErrors';

// Effective reachability of the API, not just the radio. `navigator.onLine`
// stays true on captive or dead gym wifi, so request outcomes and a cheap probe
// decide; the browser's `offline` event is trusted only in the falling direction.

const PROBE_MIN_DELAY_MS = 2000;
const PROBE_MAX_DELAY_MS = 30000;

const listeners = new Set();
let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
let probeTimer = null;
let probeDelay = PROBE_MIN_DELAY_MS;
let installed = false;

function emit() {
    listeners.forEach((listener) => listener(online));
}

function setOnline(next) {
    if (next === online) return;
    online = next;
    if (online) {
        probeDelay = PROBE_MIN_DELAY_MS;
        clearTimeout(probeTimer);
        probeTimer = null;
    } else {
        scheduleProbe();
    }
    emit();
}

async function probe() {
    probeTimer = null;
    try {
        await globalApi.probeHealth();
        setOnline(true);
        return;
    } catch {
        // Still unreachable.
    }
    probeDelay = Math.min(probeDelay * 2, PROBE_MAX_DELAY_MS);
    scheduleProbe();
}

function scheduleProbe(delay = probeDelay) {
    if (online || probeTimer || typeof window === 'undefined') return;
    probeTimer = setTimeout(probe, delay);
}

export function isOnline() {
    return online;
}

export function subscribeConnectivity(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function reportRequestSucceeded() {
    setOnline(true);
}

export function reportRequestFailed(error) {
    if (isNetworkError(error)) setOnline(false);
}

/** Check now (e.g. the tab became visible) instead of waiting for the backoff. */
export function checkConnectivity() {
    if (online) return;
    clearTimeout(probeTimer);
    probeTimer = null;
    void probe();
}

export function installConnectivity() {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('offline', () => setOnline(false));
    window.addEventListener('online', checkConnectivity);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkConnectivity();
    });

    axios.interceptors.response.use(
        (response) => {
            reportRequestSucceeded();
            return response;
        },
        (error) => {
            reportRequestFailed(error);
            return Promise.reject(error);
        },
    );

    onlineManager.setEventListener((setQueryOnline) => {
        setQueryOnline(online);
        return subscribeConnectivity(setQueryOnline);
    });

    if (!online) scheduleProbe(0);
}

export function resetConnectivityForTests({ initialOnline = true } = {}) {
    clearTimeout(probeTimer);
    probeTimer = null;
    probeDelay = PROBE_MIN_DELAY_MS;
    online = initialOnline;
    listeners.clear();
    installed = false;
}
