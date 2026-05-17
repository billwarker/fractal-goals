export const DEFAULT_GLOBAL_FILTERS = {
    goals: {
        goalIds: [],
        includeDescendants: true,
        includeInheritedActivities: true,
    },
    activities: {
        activityIds: [],
        groupIds: [],
    },
};

const toIdSet = (values) => new Set((Array.isArray(values) ? values : []).filter(Boolean));

export function normalizeGlobalFilters(filters) {
    const candidate = filters && typeof filters === 'object' ? filters : {};
    const goals = candidate.goals && typeof candidate.goals === 'object' ? candidate.goals : {};
    const activities = candidate.activities && typeof candidate.activities === 'object' ? candidate.activities : {};

    return {
        goals: {
            goalIds: Array.from(toIdSet(goals.goalIds)),
            includeDescendants: goals.includeDescendants !== false,
            includeInheritedActivities: goals.includeInheritedActivities !== false,
        },
        activities: {
            activityIds: Array.from(toIdSet(activities.activityIds)),
            groupIds: Array.from(toIdSet(activities.groupIds)),
        },
    };
}

export function hasActiveGlobalFilters(filters) {
    const normalized = normalizeGlobalFilters(filters);
    return normalized.goals.goalIds.length > 0
        || normalized.activities.activityIds.length > 0
        || normalized.activities.groupIds.length > 0;
}

function collectDescendantGoalIds(goalIds, goals) {
    const childrenByParent = new Map();
    goals.forEach((goal) => {
        const parentId = goal.parent_id || goal.attributes?.parent_id;
        if (!parentId) return;
        if (!childrenByParent.has(parentId)) {
            childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(goal.id);
    });

    const collected = new Set(goalIds);
    const stack = [...goalIds];
    while (stack.length > 0) {
        const currentId = stack.pop();
        (childrenByParent.get(currentId) || []).forEach((childId) => {
            if (!collected.has(childId)) {
                collected.add(childId);
                stack.push(childId);
            }
        });
    }
    return collected;
}

function collectDescendantGroupIds(groupIds, activityGroups) {
    const childrenByParent = new Map();
    activityGroups.forEach((group) => {
        const parentId = group.parent_id || '__root__';
        if (!childrenByParent.has(parentId)) {
            childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(group.id);
    });

    const collected = new Set(groupIds);
    const stack = [...groupIds];
    while (stack.length > 0) {
        const currentId = stack.pop();
        (childrenByParent.get(currentId) || []).forEach((childId) => {
            if (!collected.has(childId)) {
                collected.add(childId);
                stack.push(childId);
            }
        });
    }
    return collected;
}

function intersectSets(left, right) {
    if (!left) return new Set(right);
    return new Set([...left].filter((value) => right.has(value)));
}

export function resolveAnalyticsGlobalFilters({
    filters,
    goalAnalytics,
    activities = [],
    activityGroups = [],
    activityInstances = {},
}) {
    const normalized = normalizeGlobalFilters(filters);
    const goals = goalAnalytics?.goals || [];
    const selectedGoalIds = normalized.goals.goalIds;
    const goalIds = normalized.goals.includeDescendants
        ? collectDescendantGoalIds(selectedGoalIds, goals)
        : new Set(selectedGoalIds);

    const selectedGroupIds = collectDescendantGroupIds(normalized.activities.groupIds, activityGroups);
    let allowedActivityIds = null;

    if (goalIds.size > 0) {
        const goalActivityIds = new Set();
        activities.forEach((activity) => {
            const associatedGoalIds = activity.associated_goal_ids || activity.goal_ids || [];
            if (associatedGoalIds.some((goalId) => goalIds.has(goalId))) {
                goalActivityIds.add(activity.id);
            }
        });

        activityGroups.forEach((group) => {
            const associatedGoalIds = group.associated_goal_ids || group.goal_ids || [];
            if (!associatedGoalIds.some((goalId) => goalIds.has(goalId))) {
                return;
            }
            const groupIds = collectDescendantGroupIds([group.id], activityGroups);
            activities.forEach((activity) => {
                if (groupIds.has(activity.group_id)) {
                    goalActivityIds.add(activity.id);
                }
            });
        });

        if (normalized.goals.includeInheritedActivities) {
            const selectedGoals = goals.filter((goal) => goalIds.has(goal.id));
            const ancestorIds = new Set();
            selectedGoals.forEach((goal) => {
                let parentId = goal.parent_id;
                while (parentId) {
                    ancestorIds.add(parentId);
                    parentId = goals.find((candidate) => candidate.id === parentId)?.parent_id;
                }
            });
            activities.forEach((activity) => {
                const associatedGoalIds = activity.associated_goal_ids || activity.goal_ids || [];
                if (associatedGoalIds.some((goalId) => ancestorIds.has(goalId))) {
                    goalActivityIds.add(activity.id);
                }
            });
        }

        allowedActivityIds = goalActivityIds;
    }

    if (normalized.activities.activityIds.length > 0 || selectedGroupIds.size > 0) {
        const explicitActivityIds = new Set(normalized.activities.activityIds);
        activities.forEach((activity) => {
            if (selectedGroupIds.has(activity.group_id)) {
                explicitActivityIds.add(activity.id);
            }
        });
        allowedActivityIds = intersectSets(allowedActivityIds, explicitActivityIds);
    }

    const sessionIds = new Set();
    if (allowedActivityIds) {
        Object.entries(activityInstances || {}).forEach(([activityId, instances]) => {
            if (!allowedActivityIds.has(activityId)) return;
            (instances || []).forEach((instance) => {
                if (instance.session_id) {
                    sessionIds.add(instance.session_id);
                }
            });
        });
    }

    return {
        filters: normalized,
        goalIds,
        activityIds: allowedActivityIds,
        sessionIds,
        hasGoalFilter: goalIds.size > 0,
        hasActivityFilter: Boolean(allowedActivityIds),
    };
}

