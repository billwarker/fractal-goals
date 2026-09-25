import { useMemo } from 'react';

import { resolveGoalLevel, useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildGraphPresentation } from './flowTreeGraphUtils';

/**
 * Lay out the goal tree for React Flow.
 *
 * The layout is expensive, so it recomputes only when its inputs change. Child
 * sorting resolves each node's level from the goal-levels data (stable across
 * renders) rather than the context's per-render helpers.
 */
export default function useFlowTreeGraph({
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId,
    viewSettings,
    sessions,
    evidenceGoalIds,
    metricsSummary,
    activities,
    activityGroups,
    programs,
    allowedGoalIds,
    isMobile,
    layoutMode,
}) {
    const { getGoalColor, goalLevels } = useGoalLevels();
    const completedGoalColor = getGoalColor('Completed');
    const getSortChildrenBy = useMemo(
        () => (node) => resolveGoalLevel(goalLevels, node)?.sort_children_by,
        [goalLevels],
    );

    return useMemo(() => buildGraphPresentation({
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
        viewSettings,
        sessions,
        evidenceGoalIds,
        metricsSummary,
        activities,
        activityGroups,
        programs,
        allowedGoalIds,
        isMobile,
        layoutMode,
        getSortChildrenBy,
    }), [
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
        viewSettings,
        sessions,
        evidenceGoalIds,
        metricsSummary,
        activities,
        activityGroups,
        programs,
        allowedGoalIds,
        isMobile,
        layoutMode,
        getSortChildrenBy,
    ]);
}
