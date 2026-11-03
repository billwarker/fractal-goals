/** A link that opens the goal details after its tree loads. */
export const goalDeepLink = (rootId, goalId) => `/${rootId}/goals?goal=${encodeURIComponent(goalId)}`;
