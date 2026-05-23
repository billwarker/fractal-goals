import { useMemo } from 'react';
import { normalizeGoalNode } from '../utils/goalNodeModel';
import { isGoalCompletedOutsideProgramWindow } from '../utils/programGoalWindow';

export function useProgramGoalsHierarchyViewModel({
    goalSeeds = [],
    getGoalDetails,
    startDate = null,
    endDate = null,
}) {
    return useMemo(() => {
        const flattened = [];
        const seenIds = new Set();

        const walk = (goalLike, depth = 0, lineage = []) => {
            if (!goalLike) {
                return;
            }

            const resolvedGoal = getGoalDetails?.(goalLike.id || goalLike.attributes?.id) || goalLike;
            const normalized = normalizeGoalNode(resolvedGoal, { depth });
            if (!normalized?.id || seenIds.has(normalized.id)) {
                return;
            }

            const shouldHideGoal = isGoalCompletedOutsideProgramWindow(resolvedGoal, startDate, endDate);

            const nextLineage = [
                ...lineage,
                {
                    type: normalized.type,
                    completed: normalized.completed,
                },
            ];

            if (!shouldHideGoal) {
                seenIds.add(normalized.id);
                flattened.push({
                    ...normalized,
                    lineage: nextLineage,
                    originalGoal: resolvedGoal,
                });
            }

            (resolvedGoal.children || []).forEach((child) => {
                walk(child, shouldHideGoal ? depth : depth + 1, shouldHideGoal ? lineage : nextLineage);
            });
        };

        goalSeeds.forEach((seed) => walk(seed, 0, []));
        return flattened;
    }, [endDate, goalSeeds, getGoalDetails, startDate]);
}

export default useProgramGoalsHierarchyViewModel;
