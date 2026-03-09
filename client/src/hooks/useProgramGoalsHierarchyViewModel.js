import { useMemo } from 'react';
import { normalizeGoalNode } from '../utils/goalNodeModel';

export function useProgramGoalsHierarchyViewModel({ goalSeeds = [], getGoalDetails }) {
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

            seenIds.add(normalized.id);

            const nextLineage = [
                ...lineage,
                {
                    type: normalized.type,
                    completed: normalized.completed,
                },
            ];

            flattened.push({
                ...normalized,
                lineage: nextLineage,
                originalGoal: resolvedGoal,
            });

            (resolvedGoal.children || []).forEach((child) => {
                walk(child, depth + 1, nextLineage);
            });
        };

        goalSeeds.forEach((seed) => walk(seed, 0, []));
        return flattened;
    }, [goalSeeds, getGoalDetails]);
}

export default useProgramGoalsHierarchyViewModel;
