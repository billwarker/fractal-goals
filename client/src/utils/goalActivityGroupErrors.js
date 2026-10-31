/** Server codes for the one-activity-group-per-goal rule (services/goal_activity_group_links.py). */
export const GOAL_GROUP_TAKEN = 'goal_activity_group_taken';
export const GOAL_GROUP_SINGLE = 'goal_activity_group_single';

const errorBody = (error) => error?.response?.data || null;

export function isGoalGroupTaken(error) {
    return error?.response?.status === 409 && errorBody(error)?.code === GOAL_GROUP_TAKEN;
}

/** `[{ goal_id, goal_name, current_group: { id, name } }]` from a 409 taken response. */
export function getGoalGroupConflicts(error) {
    if (!isGoalGroupTaken(error)) return [];
    const conflicts = errorBody(error)?.conflicts;
    return Array.isArray(conflicts) ? conflicts : [];
}
