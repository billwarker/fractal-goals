export function getProgramDatePart(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }
        return value.toISOString().slice(0, 10);
    }

    const rawValue = String(value).trim();
    if (!rawValue) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
        return rawValue.slice(0, 10);
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString().slice(0, 10);
}

export function getGoalTargets(goal) {
    const rawTargets = goal?.targets ?? goal?.attributes?.targets;
    if (!rawTargets) {
        return [];
    }

    if (Array.isArray(rawTargets)) {
        return rawTargets;
    }

    try {
        const parsedTargets = typeof rawTargets === 'string'
            ? JSON.parse(rawTargets)
            : rawTargets;
        return Array.isArray(parsedTargets) ? parsedTargets : [];
    } catch {
        return [];
    }
}

function isTargetCompleted(target) {
    return Boolean(
        target?.completed
        ?? target?.status?.completed
        ?? target?.attributes?.completed
    );
}

export function getGoalCompleted(goal) {
    const targets = getGoalTargets(goal);
    const targetsCompleted = targets.length > 0 && targets.every(isTargetCompleted);

    return Boolean(
        goal?.completed
        ?? goal?.status?.completed
        ?? goal?.attributes?.completed
        ?? goal?.attributes?.status?.completed
        ?? targetsCompleted
    );
}

function getTargetCompletedAt(target) {
    return (
        target?.completed_at
        ?? target?.completedAt
        ?? target?.status?.completed_at
        ?? target?.status?.completedAt
        ?? target?.attributes?.completed_at
        ?? target?.attributes?.completedAt
        ?? null
    );
}

export function getGoalCompletedAt(goal) {
    const directCompletedAt = (
        goal?.completed_at
        ?? goal?.completedAt
        ?? goal?.status?.completed_at
        ?? goal?.status?.completedAt
        ?? goal?.attributes?.completed_at
        ?? goal?.attributes?.completedAt
        ?? goal?.attributes?.status?.completed_at
        ?? goal?.attributes?.status?.completedAt
        ?? null
    );

    if (directCompletedAt) {
        return directCompletedAt;
    }

    const completedTargetDates = getGoalTargets(goal)
        .filter(isTargetCompleted)
        .map(getTargetCompletedAt)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()));

    if (completedTargetDates.length === 0) {
        return null;
    }

    return new Date(Math.max(...completedTargetDates.map((value) => value.getTime()))).toISOString();
}

export function isGoalCompletedOutsideProgramWindow(goal, startDate, endDate) {
    const completed = getGoalCompleted(goal);
    const completedAt = getProgramDatePart(getGoalCompletedAt(goal));
    const programStart = getProgramDatePart(startDate);
    const programEnd = getProgramDatePart(endDate);

    if (!completed || !programStart || !programEnd || !completedAt) {
        return false;
    }

    return completedAt < programStart || completedAt > programEnd;
}

export function isGoalInProgramWindow(goal, startDate, endDate) {
    return !isGoalCompletedOutsideProgramWindow(goal, startDate, endDate);
}

function uniqueIds(ids = []) {
    return Array.from(new Set((ids || []).filter(Boolean)));
}

function getGoalId(goal) {
    return goal?.id || goal?.attributes?.id || null;
}

function getGoalChildren(goal) {
    return Array.isArray(goal?.children) ? goal.children : [];
}

export function buildProgramGoalLookup(goals = []) {
    const goalById = new Map();

    goals.forEach((goal) => {
        const goalId = getGoalId(goal);
        if (goalId) {
            goalById.set(goalId, goal);
        }
    });

    return goalById;
}

export function buildProgramGoalChildrenMap(goals = []) {
    const childrenById = new Map();

    goals.forEach((goal) => {
        const goalId = getGoalId(goal);
        if (!goalId) {
            return;
        }
        childrenById.set(goalId, getGoalChildren(goal).map(getGoalId).filter(Boolean));
    });

    return childrenById;
}

export function expandProgramGoalIds(goalIds = [], childrenById, options = {}) {
    const { shouldIncludeGoal = () => true } = options;
    const visited = new Set();
    const ordered = [];

    goalIds.forEach((goalId) => {
        const stack = [goalId];

        while (stack.length > 0) {
            const currentId = stack.pop();
            if (!currentId || visited.has(currentId)) {
                continue;
            }

            visited.add(currentId);
            if (shouldIncludeGoal(currentId)) {
                ordered.push(currentId);
            }

            const childIds = childrenById.get(currentId) || [];
            for (let index = childIds.length - 1; index >= 0; index -= 1) {
                stack.push(childIds[index]);
            }
        }
    });

    return ordered;
}

export function deriveProgramHierarchySeedIds(goalIds = [], childrenById) {
    const uniqueGoalIds = uniqueIds(goalIds);

    return uniqueGoalIds.filter((goalId) => {
        return !uniqueGoalIds.some((otherId) => {
            if (otherId === goalId) {
                return false;
            }

            return expandProgramGoalIds([otherId], childrenById).includes(goalId);
        });
    });
}

export function pruneProgramGoalTreeForWindow(goal, startDate, endDate) {
    if (!goal) {
        return [];
    }

    const keptChildren = getGoalChildren(goal).flatMap((child) => (
        pruneProgramGoalTreeForWindow(child, startDate, endDate)
    ));

    if (!isGoalInProgramWindow(goal, startDate, endDate)) {
        return keptChildren;
    }

    return [{
        ...goal,
        children: keptChildren,
    }];
}

export function buildProgramGoalScope({
    program,
    goals = [],
    getGoalDetails,
} = {}) {
    const programGoalIds = program?.goal_ids || [];
    const startDate = program?.start_date || null;
    const endDate = program?.end_date || null;
    const goalById = buildProgramGoalLookup(goals);
    const childrenById = buildProgramGoalChildrenMap(goals);
    const resolveGoal = (goalId) => getGoalDetails?.(goalId) || goalById.get(goalId) || null;
    const isGoalIdInProgramWindow = (goalId) => isGoalInProgramWindow(
        resolveGoal(goalId),
        startDate,
        endDate,
    );
    const expandAssociatedGoalIds = (goalIds = []) => expandProgramGoalIds(goalIds, childrenById, {
        shouldIncludeGoal: isGoalIdInProgramWindow,
    });
    const programScopeGoalIds = deriveProgramHierarchySeedIds(
        expandAssociatedGoalIds(programGoalIds),
        childrenById,
    );
    const hierarchyGoalSeeds = programScopeGoalIds
        .flatMap((goalId) => pruneProgramGoalTreeForWindow(resolveGoal(goalId), startDate, endDate))
        .filter(Boolean);

    return {
        expandAssociatedGoalIds,
        goalById,
        hierarchyGoalSeeds,
        hierarchySeedIds: programScopeGoalIds,
        programScopeGoalIds,
    };
}
