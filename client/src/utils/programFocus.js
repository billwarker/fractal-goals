/**
 * Client-side mirror of program-day goal scope (services/program_focus.py): a program
 * day's goals come from the program's goals and their descendants. The server is
 * authoritative; this lets editors offer only valid goals.
 */
import { buildChildIdsByParent, collectDescendantIds, normalizeGoal } from '../components/goals/goalHierarchySelectorUtils';

export const DAY_GOAL_OUT_OF_SCOPE = 'program_day_goal_out_of_scope';

/**
 * @param {Array<object>} goals
 * @param {Array<string>} seedIds
 * @returns {Set<string>}
 */
export function expandFocusScope(goals, seedIds) {
    const normalized = (goals || []).map(normalizeGoal).filter(Boolean);
    const known = new Set(normalized.map((goal) => goal.id));
    const childIdsByParent = buildChildIdsByParent(normalized);
    const scope = new Set();
    (seedIds || []).filter((goalId) => known.has(goalId)).forEach((goalId) => {
        scope.add(goalId);
        collectDescendantIds(goalId, childIdsByParent).forEach((childId) => scope.add(childId));
    });
    return scope;
}

/** The goals a program day may focus on: the program's goals and their descendants. */
export function programFocusScope(goals, program) {
    return expandFocusScope(goals, program?.goal_ids || []);
}

/** Restrict a goal list to a scope, keeping list order. */
export function goalsInScope(goals, scope) {
    return (goals || []).filter((goal) => scope.has(normalizeGoal(goal)?.id));
}

/**
 * The structured day-goal error from an API failure, or ``null`` for other errors.
 * @param {any} error
 * @returns {{ code: string, message: string, conflicts: Array<object>, conflictCount: number } | null}
 */
export function focusError(error) {
    const data = error?.response?.data;
    if (!data || typeof data !== 'object' || data.code !== DAY_GOAL_OUT_OF_SCOPE) return null;
    return {
        code: data.code,
        message: data.error || "This change conflicts with the program's goals.",
        conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
        conflictCount: data.conflict_count ?? (Array.isArray(data.conflicts) ? data.conflicts.length : 0),
    };
}

/** Whether the error asks the user to confirm removing day goals outside the program's goals. */
export function isPrunableFocusConflict(error) {
    return Boolean(error?.response?.status === 409 && focusError(error));
}

/** "Day name: Goal name" lines describing what a confirmed prune would remove. */
export function describeFocusConflicts(conflicts) {
    return (conflicts || []).map((conflict) => `${conflict.name || 'Untitled'}: ${conflict.goal_name || 'a goal'}`);
}
