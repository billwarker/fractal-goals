// Every way the outbox wakes itself to send: the next retry, a store that failed, and a
// watchdog for the liveness invariant. While a change is pending and could be sent,
// something is due to send it. Each path that waits arranges its own wake-up; the
// watchdog catches any that a bug or a frozen tab leaves without one.

// While anything is pending, this often the outbox checks that something will send it.
export const WATCHDOG_INTERVAL_MS = 10000;
// A failed store read or write is retried after this, doubling up to the cap.
const STORE_RETRY_BASE_MS = 1000;
const STORE_RETRY_MAX_MS = 30000;

/**
 * @param {object} options
 * @param {() => void} options.wake Starts a flush.
 * @param {() => boolean} options.hasPending
 * @param {(scheduled: boolean) => void} options.check The watchdog's tick: is a send due by some other path?
 * @param {(callback: () => void, delay: number) => ReturnType<typeof setTimeout>} options.setTimer
 * @param {(handle: ReturnType<typeof setTimeout>) => void} options.clearTimer
 * @param {() => number} options.now
 * @param {(type: string, payload?: unknown) => void} options.emit
 */
export function createWakeups({ wake, hasPending, check, setTimer, clearTimer, now, emit }) {
    let retryTimer = null;
    let watchdogTimer = null;
    let storeFailures = 0;

    const scheduleAt = (at) => {
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = setTimer(() => {
            retryTimer = null;
            wake();
        }, Math.max(0, at - now()));
    };

    const armWatchdog = () => {
        if (watchdogTimer || !hasPending()) return;
        watchdogTimer = setTimer(() => {
            watchdogTimer = null;
            if (!hasPending()) return;
            check(Boolean(retryTimer));
            armWatchdog();
        }, WATCHDOG_INTERVAL_MS);
    };

    return {
        scheduleAt,
        armWatchdog,
        /** A store that failed (a dropped IndexedDB connection, say) is tried again with backoff. */
        storeFailed(type, error) {
            storeFailures += 1;
            console.error(`[outbox] ${type}`, error);
            emit(type, { name: error?.name || 'Error', failures: storeFailures });
            scheduleAt(now() + Math.min(STORE_RETRY_MAX_MS, STORE_RETRY_BASE_MS * 2 ** (storeFailures - 1)));
        },
        storeRecovered() {
            storeFailures = 0;
        },
    };
}
