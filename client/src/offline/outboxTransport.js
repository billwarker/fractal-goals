export function defaultId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function defaultLock(callback) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks.request('fractal-outbox', callback);
    }
    return callback();
}

/** Sending waits on the network, so it has its own lock: `lock` stays free for saving new changes. */
export function defaultDrainLock(callback, { steal = false } = {}) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks.request('fractal-outbox-drain', steal ? { steal: true } : {}, callback);
    }
    return callback();
}

export const isLockStolen = (error) => error?.name === 'AbortError';

const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

// Answers that say "not right now" and nothing about the change itself.
const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504]);

const isInFlightClaim = (error) => error?.response?.status === 409 && error.response.data?.code === 'idempotency_in_flight';

// A failed refresh or CSRF check surfaces as the op's error, but says nothing about the op.
const isAuthFailure = (error) => (
    String(error?.config?.url || '').includes('/auth/')
    || (error?.response?.status === 403 && /csrf/i.test(String(error.response.data?.error || '')))
);

/** How a failed send should be handled: retry later, pause for auth, or reject. */
export function classifyFailure(error) {
    const status = error?.response?.status;
    if (!error?.response) return 'retry';
    if (status === 401) return 'auth';
    if (TRANSIENT_STATUSES.has(status) || status >= 500 || isInFlightClaim(error)) return 'retry';
    if (isAuthFailure(error)) return 'auth';
    return 'reject';
}

/** A server error that may be caused by this change. Outages, rate limits and open claims never count. */
export function countsTowardGivingUp(error) {
    return error?.response?.status >= 500 && !TRANSIENT_STATUSES.has(error.response.status);
}

/** The wait a `Retry-After` header asks for (seconds or a date), within reason; 0 without one. */
export function retryAfterMs(error, now = Date.now()) {
    const headers = error?.response?.headers;
    const raw = typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
    if (!raw) return 0;
    const seconds = Number(raw);
    const wait = Number.isNaN(seconds) ? Date.parse(raw) - now : seconds * 1000;
    return wait > 0 ? Math.min(wait, MAX_RETRY_AFTER_MS) : 0;
}

export function describeError(error) {
    return {
        status: error?.response?.status ?? null,
        message: error?.response?.data?.error || error?.message || 'Request failed',
        code: error?.response?.data?.code ?? null,
    };
}

