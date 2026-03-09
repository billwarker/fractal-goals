import { useCallback, useMemo } from 'react';

function uniqueIds(ids = []) {
    return Array.from(new Set((ids || []).filter(Boolean)));
}

function buildChildrenMap(goals = []) {
    const map = new Map();

    goals.forEach((goal) => {
        map.set(goal.id, (goal.children || []).map((child) => child.id).filter(Boolean));
    });

    return map;
}

function expandGoalIds(goalIds = [], childrenById) {
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
            ordered.push(currentId);

            const childIds = childrenById.get(currentId) || [];
            for (let index = childIds.length - 1; index >= 0; index -= 1) {
                stack.push(childIds[index]);
            }
        }
    });

    return ordered;
}

function deriveHierarchySeedIds(goalIds = [], childrenById) {
    const uniqueGoalIds = uniqueIds(goalIds);

    return uniqueGoalIds.filter((goalId) => {
        return !uniqueGoalIds.some((otherId) => {
            if (otherId === goalId) {
                return false;
            }

            const descendants = expandGoalIds([otherId], childrenById);
            return descendants.includes(goalId);
        });
    });
}

export function useProgramGoalSets({ program, goals = [], getGoalDetails }) {
    const blocks = program?.blocks || [];

    const childrenById = useMemo(() => buildChildrenMap(goals), [goals]);

    const expandAssociatedGoalIds = useCallback((goalIds = []) => {
        return expandGoalIds(goalIds, childrenById);
    }, [childrenById]);

    const directAssociatedGoalIds = useMemo(() => uniqueIds([
        ...(program?.goal_ids || []),
        ...blocks.flatMap((block) => block.goal_ids || []),
    ]), [blocks, program?.goal_ids]);

    const hierarchySeedIds = useMemo(() => {
        return deriveHierarchySeedIds(directAssociatedGoalIds, childrenById);
    }, [childrenById, directAssociatedGoalIds]);

    const attachedGoalIds = useMemo(() => {
        return new Set(expandAssociatedGoalIds(directAssociatedGoalIds));
    }, [directAssociatedGoalIds, expandAssociatedGoalIds]);

    const directAssociatedGoals = useMemo(() => {
        return directAssociatedGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [directAssociatedGoalIds, getGoalDetails]);

    const hierarchyGoalSeeds = useMemo(() => {
        return hierarchySeedIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [getGoalDetails, hierarchySeedIds]);

    const attachedGoals = useMemo(() => {
        return Array.from(attachedGoalIds).map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    return {
        attachedGoalIds,
        attachedGoals,
        directAssociatedGoalIds,
        directAssociatedGoals,
        hierarchyGoalSeeds,
        hierarchySeedIds,
        expandAssociatedGoalIds,
    };
}

export default useProgramGoalSets;
