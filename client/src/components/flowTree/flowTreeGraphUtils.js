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

const getTreeIconCenter = (node, compact = false) => {
    const iconSize = compact ? 22 : 30;
    return {
        x: node.position.x + (iconSize / 2),
        y: node.position.y + (iconSize / 2),
    };
};

export const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
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
    const iconSize = compact ? 22 : 30;

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
                x: nodeWithPosition.x - iconSize / 2,
                y: nodeWithPosition.y - iconSize / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

export const getHierarchyLayoutedElements = (nodes, edges, compact = false) => {
    const childrenById = new Map();
    const incomingIds = new Set();
    const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));

    nodes.forEach((node) => childrenById.set(node.id, []));
    edges.forEach((edge) => {
        if (!childrenById.has(edge.source) || !childrenById.has(edge.target)) return;
        childrenById.get(edge.source).push(edge.target);
        incomingIds.add(edge.target);
    });

    childrenById.forEach((children) => {
        children.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    });

    const roots = nodes
        .filter((node) => !incomingIds.has(node.id))
        .map((node) => node.id);

    const rowById = new Map();
    const depthById = new Map();
    const visited = new Set();
    let rowIndex = 0;

    const visit = (nodeId, depth) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        rowById.set(nodeId, rowIndex);
        depthById.set(nodeId, depth);
        rowIndex += 1;

        (childrenById.get(nodeId) || []).forEach((childId) => visit(childId, depth + 1));
    };

    roots.forEach((rootId) => visit(rootId, 0));
    nodes.forEach((node) => visit(node.id, 0));

    const depthIndent = compact ? 28 : 44;
    const rowHeight = compact ? 84 : 72;
    const originX = compact ? 24 : 56;
    const originY = compact ? 32 : 48;

    const layoutedNodes = nodes.map((node) => ({
        ...node,
        position: {
            x: originX + ((depthById.get(node.id) || 0) * depthIndent),
            y: originY + ((rowById.get(node.id) || 0) * rowHeight),
        },
    }));

    const layoutedEdges = edges.map((edge) => ({
        ...edge,
        type: 'step',
        className: [edge.className, 'hierarchy-edge'].filter(Boolean).join(' '),
    }));

    return { nodes: layoutedNodes, edges: layoutedEdges };
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
    } = {}
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
    evidenceGoalIds,
    metricsSummary,
    activities,
    activityGroups,
    programs,
    isMobile,
    layoutMode = 'tree',
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
        {
            hideCompletedGoals: normalizedSettings.hideCompletedGoals,
            hiddenInactiveGoalIds: normalizedSettings.hideInactiveGoals ? inactiveNodeIds : null,
            activeLineageIds,
        }
    );

    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutMode === 'hierarchy'
        ? getHierarchyLayoutedElements(rawNodes, rawEdges, isMobile)
        : getLayoutedElements(rawNodes, rawEdges, 'TB', isMobile);
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

    return {
        nodes,
        edges: baseEdges,
        metrics,
    };
};
