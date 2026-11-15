// Goals a write completed or reverted by their conditions. The server adds `goal_changes` to any
// write response that changed one (blueprints/goal_changes.py); every request, the outbox's
// included, goes through axios, so one response hook announces them all.

const GOAL_CHANGES_EVENT = 'fractal:goal-changes';

/** The fractal an `/api/<rootId>/...` request belongs to. */
export function rootIdFromApiUrl(url) {
    const match = /\/api\/([^/?#]+)\//.exec(String(url || ''));
    return match ? decodeURIComponent(match[1]) : null;
}

export function publishGoalChanges(rootId, changes) {
    const completed = Array.isArray(changes?.completed) ? changes.completed : [];
    const uncompleted = Array.isArray(changes?.uncompleted) ? changes.uncompleted : [];
    if (!rootId || (!completed.length && !uncompleted.length) || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(GOAL_CHANGES_EVENT, { detail: { rootId, completed, uncompleted } }));
}

/** The axios response hook: announce a write's goal changes, and pass the response on. */
export function publishGoalChangesFromResponse(response) {
    const changes = response?.data?.goal_changes;
    if (changes) publishGoalChanges(rootIdFromApiUrl(response.config?.url), changes);
    return response;
}

/** Calls `handler({ rootId, completed, uncompleted })` for each announcement; returns the unsubscribe. */
export function subscribeGoalChanges(handler) {
    const listener = (event) => handler(event.detail);
    window.addEventListener(GOAL_CHANGES_EVENT, listener);
    return () => window.removeEventListener(GOAL_CHANGES_EVENT, listener);
}
