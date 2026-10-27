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

/** How a failed send should be handled: retry later, pause for auth, or reject. */
export function classifyFailure(error) {
    const status = error?.response?.status;
    if (!error?.response) return 'retry';
    if (status === 401) return 'auth';
    if (status === 408 || status === 429 || status >= 500) return 'retry';
    if (status === 409 && error.response.data?.code === 'idempotency_in_flight') return 'retry';
    return 'reject';
}

export function describeError(error) {
    return {
        status: error?.response?.status ?? null,
        message: error?.response?.data?.error || error?.message || 'Request failed',
        code: error?.response?.data?.code ?? null,
    };
}

