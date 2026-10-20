import { useMemo } from 'react';

import { resolveGoalLevel, useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildGraphPresentation, prepareGraphPresentation, getLayoutedElements, getHierarchyLayoutedElements } from './flowTreeGraphUtils';

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
    evidenceGoalIds,
    metricsSummary,
    activities,
    activityGroups,
    programs,
    allowedGoalIds,
    focusGoalIds = null,
    isMobile,
    layoutMode,
}) {
    const { getGoalColor, goalLevels } = useGoalLevels();
    const completedGoalColor = getGoalColor('Completed');
    const getSortChildrenBy = useMemo(
        () => (node) => resolveGoalLevel(goalLevels, node)?.sort_children_by,
        [goalLevels],
    );

    const structure = useMemo(() => prepareGraphPresentation({
        treeData, onNodeClick, onAddChild, selectedNodeId, completedGoalColor, viewSettings,
        evidenceGoalIds, allowedGoalIds, focusGoalIds, getSortChildrenBy,
    }), [treeData, onNodeClick, onAddChild, selectedNodeId, completedGoalColor,
        viewSettings, evidenceGoalIds, allowedGoalIds, focusGoalIds, getSortChildrenBy]);

    // Fixed node dimensions make geometry depend only on ordered topology and layout.
    // Selection still changes topology when it narrows the tree to a lineage.
    const topology = JSON.stringify({
        nodes: structure?.rawNodes.map(({ id }) => ({ id })) || [],
        edges: structure?.rawEdges.map(({ id, source, target }) => ({ id, source, target })) || [],
    });
    const geometry = useMemo(() => {
        const { nodes, edges } = JSON.parse(topology);
        return layoutMode === 'hierarchy'
            ? getHierarchyLayoutedElements(nodes, edges, isMobile)
            : getLayoutedElements(nodes, edges, 'TB', isMobile);
    }, [topology, isMobile, layoutMode]);

    return useMemo(() => buildGraphPresentation({
        structure, geometry, completedGoalColor, metricsSummary, activities,
        activityGroups, programs, isMobile, layoutMode,
    }), [structure, geometry, completedGoalColor, metricsSummary, activities,
        activityGroups, programs, isMobile, layoutMode]);
}
