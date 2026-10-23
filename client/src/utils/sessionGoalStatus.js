/**
 * A session goal's completion status. Completion is decided on the server; condition progress
 * (when the goal completes on its own) says how close it is and whether it is already met.
 *
 * @param {any} goal
 * @param {Record<string, any> | null | undefined} progressByGoalId
 */
export function getGoalStatus(goal, progressByGoalId) {
    const progress = progressByGoalId?.[String(goal?.id)] || null;
    const persistedCompleted = Boolean(goal?.completed || goal?.attributes?.completed);
    const completed = persistedCompleted || Boolean(progress?.completed);
    return {
        completed,
        reason: completed ? 'goal_completed' : 'pending',
        progress,
        readyForCompletion: !completed && Boolean(progress?.met),
    };
}
