import { useSyncExternalStore } from 'react';

/**
 * The past instance hovered (or focused) in the Progress pane's history, so its point stands
 * out on the pane's chart and on the expanded chart. A tiny external store, so a hover only
 * re-renders the charts, not Session Detail.
 */
let hoveredInstanceId = null;
const listeners = new Set();

export function setProgressHover(instanceId) {
    const next = instanceId || null;
    if (next === hoveredInstanceId) return;
    hoveredInstanceId = next;
    listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export default function useProgressHover() {
    return useSyncExternalStore(subscribe, () => hoveredInstanceId, () => null);
}
