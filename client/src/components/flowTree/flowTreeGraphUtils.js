import { getLayoutedElements, getHierarchyLayoutedElements } from './flowTreeLayout';
export { getLayoutedElements, getHierarchyLayoutedElements, FLOWTREE_LAYOUT_NODE_DIMENSIONS } from './flowTreeLayout';

import { buildGraphMetricsFromSummary, getActiveLineageIds, getInactiveNodeIds } from '../../hooks/useFlowTreeMetrics';
import { getValidChildTypes } from '../../utils/goalHelpers';
import {
    getGoalNodeChildren,
    getGoalNodeId,
    getGoalNodeName,
    getGoalNodeType,
    normalizeGoalNode,
} from '../../utils/goalNodeModel';
import { isSMART } from '../../utils/smartHelpers';
import { buildTreeMaps, getLineagePath, sortChildren } from './flowTreeTreeUtils';
import { orderSequencedSiblings } from '../../utils/goalSequenceOrder';

export { orderSequencedSiblings };

const toId = (value) => (value == null ? null : String(value));

const getTreeIconCenter = (node, compact = false) => {
    const iconSize = compact ? 22 : 30;
    return {
        x: node.position.x + (iconSize / 2),
        y: node.position.y + (iconSize / 2),
    };
};

/** Dashed arrows between consecutive visible steps of each sequence (not used for layout). */
export const buildSequenceEdges = (orderedChildren, visibleNodeIds) => {
    const byTrack = new Map();
    orderedChildren.forEach((child) => {
        const trackId = toId(child.sequence_track_id ?? child.attributes?.sequence_track_id);
        const childId = toId(getGoalNodeId(child));
        if (trackId && childId && visibleNodeIds.has(childId)) byTrack.set(trackId, [...(byTrack.get(trackId) || []), child]);
    });
    return [...byTrack.values()].flatMap((steps) => steps.slice(1).map((step, index) => {
        const source = toId(getGoalNodeId(steps[index]));
        const target = toId(getGoalNodeId(step));
        return {
            id: `sequence-${source}-${target}`,
            source,
            target,
            type: 'sequence',
            className: 'sequence-edge',
            data: { sequence: true },
        };
    }));
};

export const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
};

export const convertTreeToFlow = (
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId = null,
    completedGoalColor = '#FFD700',
    {
        hideCompletedGoals = false,
        hiddenInactiveGoalIds = null,
        activeLineageIds = new Set(),
        allowedGoalIds = null,
        getSortChildrenBy = null,
    } = {}
) => {
    const nodes = [];
    const edges = [];
    const siblingGroups = [];
    const addedNodeIds = new Set();
    const visibleNodeIds = new Set();

    const lineagePath = selectedNodeId ? getLineagePath(treeData, selectedNodeId) : null;

    const traverse = (node, parentId = null) => {
        if (!node) return;

        const normalizedNode = normalizeGoalNode(node);
        const nodeId = toId(getGoalNodeId(normalizedNode));
        if (!nodeId) return;

        if (addedNodeIds.has(nodeId)) return;
        if (allowedGoalIds && !allowedGoalIds.has(nodeId)) return;
        if (lineagePath && !lineagePath.has(nodeId)) return;
        if (hideCompletedGoals && Boolean(node.attributes?.completed || node.completed)) return;
        if (hiddenInactiveGoalIds?.has(nodeId) && !activeLineageIds.has(nodeId)) return;

        const nodeType = getGoalNodeType(normalizedNode);

        addedNodeIds.add(nodeId);
        visibleNodeIds.add(nodeId);

        if (parentId) {
            const isCompleted = Boolean(node.attributes?.completed || node.completed);
            edges.push({
                id: `${parentId}-${nodeId}`,
                source: toId(parentId),
                target: nodeId,
                type: 'straight',
                className: isCompleted ? 'completed-edge' : '',
                style: {
                    stroke: isCompleted ? completedGoalColor : 'var(--color-connection-line)',
                    strokeWidth: isCompleted ? 2.5 : 1.5,
                },
            });
        }

        const validChildren = getValidChildTypes(nodeType);
        const hasAddChild = Boolean(onAddChild) && validChildren.length > 0;
        const childTypeName = hasAddChild
            ? (validChildren.length === 1 ? validChildren[0].replace(/([A-Z])/g, ' $1').trim() : 'Child Goal')
            : null;

        nodes.push({
            id: nodeId,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
                goal: normalizedNode,
                label: getGoalNodeName(normalizedNode),
                type: nodeType,
                completed: normalizedNode.completed,
                completed_at: normalizedNode.completed_at,
                paused: normalizedNode.paused,
                created_at: normalizedNode.created_at,
                deadline: normalizedNode.deadline,
                hasChildren: normalizedNode.children.length > 0,
                isSmart: normalizedNode.is_smart || isSMART(node),
                layoutMode: 'tree',
                onClick: () => onNodeClick(node),
                onAddChild: hasAddChild ? () => onAddChild(node) : null,
                childTypeName,
            },
        });

        const children = getGoalNodeChildren(node);
        if (children.length > 0) {
            // Landing snapshots embed level settings; app goals resolve them by level_id.
            const sortBy = node.level_characteristics?.sort_children_by
                || node.attributes?.level_characteristics?.sort_children_by
                || getSortChildrenBy?.(node);
            const sortedChildren = orderSequencedSiblings(sortChildren(children, sortBy));
            siblingGroups.push(sortedChildren);
            sortedChildren.forEach((child) => traverse(child, nodeId));
        }
    };

    traverse(treeData);
    const sequenceEdges = siblingGroups.flatMap((group) => buildSequenceEdges(group, visibleNodeIds));

    return { nodes, edges, visibleNodeIds, sequenceEdges };
};

export const prepareGraphPresentation = ({
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId,
    completedGoalColor,
    viewSettings,
    evidenceGoalIds,
    allowedGoalIds = null,
    getSortChildrenBy = null,
}) => {
    if (!treeData) {
        return null;
    }

    const normalizedSettings = {
        ...DEFAULT_VIEW_SETTINGS,
        ...(viewSettings || {}),
    };

    const treeMaps = buildTreeMaps(treeData);
    const effectiveEvidenceGoalIds = evidenceGoalIds || new Set();
    const activeLineageIds = getActiveLineageIds(effectiveEvidenceGoalIds, treeMaps.parentById, treeMaps.nodeById);
    const inactiveNodeIds = getInactiveNodeIds(treeMaps.nodeById, treeMaps.childrenById, effectiveEvidenceGoalIds);

    const { nodes: rawNodes, edges: rawEdges, visibleNodeIds, sequenceEdges } = convertTreeToFlow(
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
        {
            hideCompletedGoals: normalizedSettings.hideCompletedGoals,
            hiddenInactiveGoalIds: normalizedSettings.hideInactiveGoals ? inactiveNodeIds : null,
            activeLineageIds,
            allowedGoalIds,
            getSortChildrenBy,
        }
    );

    // Sequence arrows are drawn over the tree but never fed to layout, so positions don't change.
    return { rawNodes, rawEdges, visibleNodeIds, treeMaps, effectiveEvidenceGoalIds,
        activeLineageIds, inactiveNodeIds, normalizedSettings, sequenceEdges };
};

export const buildGraphPresentation = ({
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId,
    completedGoalColor,
    viewSettings,
    evidenceGoalIds,
    metricsSummary,
    activities,
    activityGroups,
    programs,
    allowedGoalIds = null,
    isMobile,
    layoutMode = 'tree',
    getSortChildrenBy = null,
    structure = null,
    geometry = null,
}) => {
    const prepared = structure || prepareGraphPresentation({
        treeData, onNodeClick, onAddChild, selectedNodeId, completedGoalColor, viewSettings,
        evidenceGoalIds, allowedGoalIds, getSortChildrenBy,
    });
    if (!prepared) return { nodes: [], edges: [], metrics: null };
    const { rawNodes, rawEdges, visibleNodeIds, treeMaps, effectiveEvidenceGoalIds,
        activeLineageIds, inactiveNodeIds, normalizedSettings, sequenceEdges = [] } = prepared;

    const layout = geometry || (layoutMode === 'hierarchy'
        ? getHierarchyLayoutedElements(rawNodes, rawEdges, isMobile)
        : getLayoutedElements(rawNodes, rawEdges, 'TB', isMobile));
    const positions = new Map(layout.nodes.map((node) => [node.id, node.position]));
    const edgeGeometry = new Map(layout.edges.map((edge) => [edge.id, edge]));
    const layoutedNodes = rawNodes.map((node) => ({ ...node, position: positions.get(node.id) }));
    const layoutedEdges = rawEdges.map((edge) => ({ ...edge, type: edgeGeometry.get(edge.id)?.type || edge.type,
        className: [edge.className, layoutMode === 'hierarchy' ? 'hierarchy-edge' : ''].filter(Boolean).join(' ') }));
    const layoutedNodeById = new Map(layoutedNodes.map((node) => [node.id, node]));

    const nodeStyleMap = new Map();
    const pausedNodeIds = new Set();
    layoutedNodes.forEach((node) => {
        const isActive = activeLineageIds.has(node.id);
        const isInactive = inactiveNodeIds.has(node.id);
        const isPaused = Boolean(node.data?.paused);
        const shouldFadeInactive = isInactive && !isActive;
        const shouldFade = normalizedSettings.fadeInactiveBranches && (shouldFadeInactive || isPaused);

        if (isPaused) {
            pausedNodeIds.add(node.id);
        }

        if (shouldFade) {
            nodeStyleMap.set(node.id, {
                opacity: isPaused ? 0.34 : 0.22,
                transition: 'opacity 140ms ease-in-out',
            });
        }
    });

    const nodes = layoutedNodes.map((node) => {
        const style = nodeStyleMap.get(node.id);
        const data = {
            ...node.data,
            layoutMode,
            hasEvidence: effectiveEvidenceGoalIds.has(node.id),
        };
        if (!style) return { ...node, data };
        return { ...node, data, style };
    });

    const baseEdges = layoutedEdges.flatMap((edge) => {
        const sourceId = toId(edge.source);
        const targetId = toId(edge.target);
        const isActiveBranchEdge = activeLineageIds.has(sourceId) && activeLineageIds.has(targetId);
        const sourceNode = treeMaps.nodeById.get(sourceId);
        const targetNode = treeMaps.nodeById.get(targetId);
        const sourceCompleted = Boolean(sourceNode?.attributes?.completed || sourceNode?.completed);
        const targetCompleted = Boolean(targetNode?.attributes?.completed || targetNode?.completed);
        const connectsCompletedGoals = sourceCompleted && targetCompleted;
        const activeBranchColor = connectsCompletedGoals
            ? completedGoalColor
            : 'var(--color-active-branch-line, #60a5fa)';

        const shouldFadeEdge = normalizedSettings.fadeInactiveBranches
            && (
                pausedNodeIds.has(targetId)
                || inactiveNodeIds.has(targetId)
            );

        const nextClassName = [
            edge.className,
            isActiveBranchEdge && !shouldFadeEdge ? 'active-branch-edge' : '',
            shouldFadeEdge ? 'faded-edge' : '',
        ].filter(Boolean).join(' ');

        const style = { ...(edge.style || {}) };
        if (isActiveBranchEdge && !shouldFadeEdge) {
            style.stroke = activeBranchColor;
            style.strokeWidth = edge.className?.includes('completed-edge') ? 3 : 2.25;
            style.opacity = 0.88;
            style['--active-branch-highlight-color'] = activeBranchColor;
        }
        if (shouldFadeEdge) {
            style.opacity = pausedNodeIds.has(targetId) ? 0.26 : 0.16;
            style.strokeWidth = 1;
        }

        const baseEdge = {
            ...edge,
            type: layoutMode === 'tree' ? 'treeCenter' : edge.type,
            className: nextClassName,
            style,
            data: layoutMode === 'tree'
                ? {
                    ...(edge.data || {}),
                    sourceCenter: layoutedNodeById.has(sourceId)
                        ? getTreeIconCenter(layoutedNodeById.get(sourceId), isMobile)
                        : null,
                    targetCenter: layoutedNodeById.has(targetId)
                        ? getTreeIconCenter(layoutedNodeById.get(targetId), isMobile)
                        : null,
                }
                : edge.data,
        };

        if (layoutMode === 'hierarchy' || !isActiveBranchEdge || shouldFadeEdge) {
            return [baseEdge];
        }

        return [
            baseEdge,
            {
                ...edge,
                id: `${edge.id}-active-flow`,
                type: 'treeCenter',
                className: 'active-branch-flow-edge journey-edge journey-edge-to-root',
                style: {
                    stroke: activeBranchColor,
                    strokeWidth: 2,
                    strokeDasharray: '7 15',
                    opacity: 0.58,
                    pointerEvents: 'none',
                    '--active-branch-highlight-color': activeBranchColor,
                },
                data: {
                    ...(edge.data || {}),
                    overlay: true,
                    sourceCenter: layoutedNodeById.has(sourceId)
                        ? getTreeIconCenter(layoutedNodeById.get(sourceId), isMobile)
                        : null,
                    targetCenter: layoutedNodeById.has(targetId)
                        ? getTreeIconCenter(layoutedNodeById.get(targetId), isMobile)
                        : null,
                },
            },
        ];
    });

    const metrics = buildGraphMetricsFromSummary(
        rawNodes,
        visibleNodeIds,
        activeLineageIds,
        inactiveNodeIds,
        activities,
        activityGroups,
        programs || [],
        metricsSummary,
        treeMaps.childrenById
    );

    const sequenceArrows = layoutMode === 'tree' ? sequenceEdges.flatMap((edge) => {
        const source = layoutedNodeById.get(edge.source);
        const target = layoutedNodeById.get(edge.target);
        if (!source || !target) return [];
        return [{
            ...edge,
            style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5, strokeDasharray: '5 5', pointerEvents: 'none' },
            markerEnd: { type: 'arrowclosed', color: 'var(--color-text-muted)', width: 14, height: 14 },
            data: {
                ...edge.data,
                sourceCenter: getTreeIconCenter(source, isMobile),
                targetCenter: getTreeIconCenter(target, isMobile),
                iconRadius: isMobile ? 11 : 15,
            },
        }];
    }) : [];

    return {
        nodes,
        edges: [...baseEdges, ...sequenceArrows],
        metrics,
    };
};
