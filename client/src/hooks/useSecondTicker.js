import { useSyncExternalStore } from 'react';

/**
 * One shared one-second clock for live timers. Every subscriber reads the same `nowMs` on the
 * same tick, so an activity card, a circuit timer and the session's Activity total change together
 * instead of each on its own interval. The interval runs only while something subscribes.
 */
const listeners = new Set();
let nowMs = Date.now();
let interval = null;

function tick() {
    nowMs = Date.now();
    listeners.forEach((listener) => listener());
}

function subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) {
        // A newly started clock reads the time now, not when it last stopped.
        tick();
        interval = window.setInterval(tick, 1000);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && interval !== null) {
            window.clearInterval(interval);
            interval = null;
        }
    };
}

const noopSubscribe = () => () => {};
const getSnapshot = () => nowMs;

/** The shared clock's time, ticking each second while `enabled`; otherwise the last tick. */
export default function useSecondTicker(enabled = true) {
    return useSyncExternalStore(enabled ? subscribe : noopSubscribe, getSnapshot, getSnapshot);
}
