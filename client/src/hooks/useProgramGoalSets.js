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
    const programGoalIds = program?.goal_ids || [];
    const blockGoalIds = useMemo(() => uniqueIds(blocks.flatMap((block) => block.goal_ids || [])), [blocks]);

    const childrenById = useMemo(() => buildChildrenMap(goals), [goals]);

    const expandAssociatedGoalIds = useCallback((goalIds = []) => {
        return expandGoalIds(goalIds, childrenById);
    }, [childrenById]);

    const directAssociatedGoalIds = useMemo(() => uniqueIds([
        ...programGoalIds,
        ...blockGoalIds,
    ]), [blockGoalIds, programGoalIds]);

    const programScopeGoalIds = useMemo(() => {
        return deriveHierarchySeedIds(programGoalIds, childrenById);
    }, [childrenById, programGoalIds]);

    const hierarchySeedIds = useMemo(() => {
        return deriveHierarchySeedIds(programGoalIds, childrenById);
    }, [childrenById, programGoalIds]);

    const attachedGoalIds = useMemo(() => {
        return new Set(uniqueIds([
            ...expandAssociatedGoalIds(programGoalIds),
            ...blockGoalIds,
        ]));
    }, [blockGoalIds, expandAssociatedGoalIds, programGoalIds]);

    const directAssociatedGoals = useMemo(() => {
        return directAssociatedGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [directAssociatedGoalIds, getGoalDetails]);

    const attachableBlockGoalIds = useMemo(() => {
        const scopedGoalIds = expandAssociatedGoalIds(programScopeGoalIds);

        return uniqueIds([
            ...scopedGoalIds,
            ...blockGoalIds,
        ]);
    }, [blockGoalIds, expandAssociatedGoalIds, programScopeGoalIds]);

    const attachableBlockGoals = useMemo(() => {
        return attachableBlockGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachableBlockGoalIds, getGoalDetails]);

    const hierarchyGoalSeeds = useMemo(() => {
        return hierarchySeedIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [getGoalDetails, hierarchySeedIds]);

    const attachedGoals = useMemo(() => {
        return Array.from(attachedGoalIds).map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    return {
        attachedGoalIds,
        attachedGoals,
        attachableBlockGoalIds,
        attachableBlockGoals,
        blockGoalIds,
        directAssociatedGoalIds,
        directAssociatedGoals,
        hierarchyGoalSeeds,
        hierarchySeedIds,
        programScopeGoalIds,
        expandAssociatedGoalIds,
    };
}

export default useProgramGoalSets;
