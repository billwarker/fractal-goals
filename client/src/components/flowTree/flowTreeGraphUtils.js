import dagre from 'dagre';

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

const toId = (value) => (value == null ? null : String(value));

export const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideCompletedGoals: false,
};

export const FLOWTREE_LAYOUT_NODE_DIMENSIONS = {
    compact: { width: 190, height: 70 },
    regular: { width: 250, height: 80 },
};

export const getLayoutedElements = (nodes, edges, direction = 'TB', compact = false) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const { width: nodeWidth, height: nodeHeight } = compact
        ? FLOWTREE_LAYOUT_NODE_DIMENSIONS.compact
        : FLOWTREE_LAYOUT_NODE_DIMENSIONS.regular;

    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: compact ? 56 : 100,
        ranksep: compact ? 70 : 100,
        marginx: compact ? 16 : 50,
        marginy: compact ? 20 : 50,
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

export const convertTreeToFlow = (
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId = null,
    completedGoalColor = '#FFD700',
    { hideCompletedGoals = false } = {}
) => {
    const nodes = [];
    const edges = [];
    const addedNodeIds = new Set();
    const visibleNodeIds = new Set();

    const lineagePath = selectedNodeId ? getLineagePath(treeData, selectedNodeId) : null;

    const traverse = (node, parentId = null) => {
        if (!node) return;

        const normalizedNode = normalizeGoalNode(node);
        const nodeId = toId(getGoalNodeId(normalizedNode));
        if (!nodeId) return;

        if (addedNodeIds.has(nodeId)) return;
        if (lineagePath && !lineagePath.has(nodeId)) return;
        if (hideCompletedGoals && Boolean(node.attributes?.completed || node.completed)) return;

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
        const hasAddChild = validChildren.length > 0;
        const childTypeName = hasAddChild
            ? (validChildren.length === 1 ? validChildren[0].replace(/([A-Z])/g, ' $1').trim() : 'Child Goal')
            : null;

        nodes.push({
            id: nodeId,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
                label: getGoalNodeName(normalizedNode),
                type: nodeType,
                completed: normalizedNode.completed,
                completed_at: normalizedNode.completed_at,
                frozen: normalizedNode.frozen,
                created_at: normalizedNode.created_at,
                deadline: normalizedNode.deadline,
                hasChildren: normalizedNode.children.length > 0,
                isSmart: normalizedNode.is_smart || isSMART(node),
                onClick: () => onNodeClick(node),
                onAddChild: hasAddChild ? () => onAddChild(node) : null,
                childTypeName,
            },
        });

        const children = getGoalNodeChildren(node);
        if (children.length > 0) {
            const sortBy = node.level_characteristics?.sort_children_by || node.attributes?.level_characteristics?.sort_children_by;
            const sortedChildren = sortChildren(children, sortBy);
            sortedChildren.forEach((child) => traverse(child, nodeId));
        }
    };

    traverse(treeData);

    return { nodes, edges, visibleNodeIds };
};

export const buildGraphPresentation = ({
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
    isMobile,
}) => {
    if (!treeData) {
        return { nodes: [], edges: [], metrics: null };
    }

    const normalizedSettings = {
        ...DEFAULT_VIEW_SETTINGS,
        ...(viewSettings || {}),
    };

    const treeMaps = buildTreeMaps(treeData);
    const effectiveEvidenceGoalIds = evidenceGoalIds || new Set();
    const activeLineageIds = getActiveLineageIds(effectiveEvidenceGoalIds, treeMaps.parentById, treeMaps.nodeById);
    const inactiveNodeIds = getInactiveNodeIds(treeMaps.nodeById, treeMaps.childrenById, effectiveEvidenceGoalIds);

    const { nodes: rawNodes, edges: rawEdges, visibleNodeIds } = convertTreeToFlow(
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
        { hideCompletedGoals: normalizedSettings.hideCompletedGoals }
    );

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, 'TB', isMobile);

    const nodeStyleMap = new Map();
    const pausedNodeIds = new Set();
    layoutedNodes.forEach((node) => {
        const isActive = activeLineageIds.has(node.id);
        const isInactive = inactiveNodeIds.has(node.id);
        const isPaused = Boolean(node.data?.paused ?? node.data?.frozen);
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
        if (!style) return node;
        return { ...node, style };
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
            className: nextClassName,
            style,
        };

        if (!isActiveBranchEdge || shouldFadeEdge) {
            return [baseEdge];
        }

        return [
            baseEdge,
            {
                ...edge,
                id: `${edge.id}-active-flow`,
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

    return {
        nodes,
        edges: baseEdges,
        metrics,
    };
};
