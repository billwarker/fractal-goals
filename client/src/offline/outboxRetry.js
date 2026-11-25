import { countsTowardGivingUp, isWaitingForSession, retryAfterMs } from './outboxTransport';

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
const SESSION_WAIT_MS = 30000;
// A change the server keeps failing (not one waiting for signal) goes to review
// after this, so it can't hold up its session's later changes for long. Both limits must
// pass, because a short outage must never cost changes.
const MAX_SERVER_FAILURES = 5;
const MIN_SERVER_FAILURE_AGE_MS = 10 * 60 * 1000;
// The server answering but never saving (an overload or a long outage) ends here.
const MAX_SERVER_FAILURE_AGE_MS = 24 * 60 * 60 * 1000;

function backoff(attempts, random) {
    const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
    return Math.round(base / 2 + random() * (base / 2));
}

/** After a failed send: give up (`giveUp`), or when to try next and what to record on the op. */
export function planRetry(op, error, verdict, now, random) {
    // Only a failure the server answered starts the clock; offline waits forever.
    const answered = Boolean(error?.response) && verdict !== 'auth' && !isWaitingForSession(error);
    const serverFailures = (op.serverFailures || 0) + (countsTowardGivingUp(error) ? 1 : 0);
    const firstServerFailureAt = op.firstServerFailureAt || (answered ? now : null);
    const failingFor = answered ? now - firstServerFailureAt : 0;
    if (answered && (
        failingFor >= MAX_SERVER_FAILURE_AGE_MS
        || (serverFailures >= MAX_SERVER_FAILURES && failingFor >= MIN_SERVER_FAILURE_AGE_MS)
    )) {
        return { giveUp: true };
    }
    const attempts = (op.attempts || 0) + 1;
    return {
        giveUp: false,
        nextAttemptAt: now + Math.max(
            isWaitingForSession(error) ? SESSION_WAIT_MS : backoff(attempts, random), retryAfterMs(error, now),
        ),
        fields: { attempts, serverFailures, firstServerFailureAt },
    };
}

/** Promises waiting for a scope's queue (or all of it) to empty. */
export function createDrainWaiters({ hasPending, setTimer, clearTimer }) {
    const waitersByKey = new Map();
    return {
        resolve() {
            waitersByKey.forEach((waiters, key) => {
                if (hasPending(key === '*' ? null : key)) return;
                waitersByKey.delete(key);
                waiters.forEach((done) => done());
            });
        },
        /** With `timeoutMs`, rejects if the queue hasn't drained by then (the connection or sign-in may have gone). */
        whenDrained(scope = null, { timeoutMs = null } = {}) {
            const key = scope || '*';
            if (!hasPending(scope)) return Promise.resolve();
            return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
                const timer = timeoutMs ? setTimer(() => {
                    waitersByKey.set(key, (waitersByKey.get(key) || []).filter((waiter) => waiter !== done));
                    reject(new Error('Earlier changes are still syncing'));
                }, timeoutMs) : null;
                const done = () => {
                    if (timer) clearTimer(timer);
                    resolve();
                };
                waitersByKey.set(key, [...(waitersByKey.get(key) || []), done]);
            }));
        },
    };
}
