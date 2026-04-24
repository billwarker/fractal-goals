import dagre from 'dagre';

import { buildGraphMetricsFromSummary, deriveEvidenceGoalIds, getActiveLineageIds, getInactiveNodeIds } from '../../hooks/useFlowTreeMetrics';
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
    highlightActiveBranches: false,
    fadeInactiveBranches: false,
    showCompletionJourney: false,
};

export const getLayoutedElements = (nodes, edges, direction = 'TB', compact = false) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = compact ? 190 : 250;
    const nodeHeight = compact ? 70 : 80;

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
    completedGoalColor = '#FFD700'
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

export const applyCompletionJourneyYRemap = (nodes, orderedCompletedIds, enabled, isMobile, parentById, childrenById) => {
    if (!enabled) return nodes;

    const remappedNodes = nodes.map((node) => ({
        ...node,
        position: {
            ...node.position,
            y: node.position.y + (isMobile ? 70 : 110),
        },
    }));

    const completedNodes = orderedCompletedIds
        .map((id) => remappedNodes.find((node) => node.id === id))
        .filter(Boolean);

    if (completedNodes.length < 2) {
        return remappedNodes;
    }

    const maxY = Math.max(...remappedNodes.map((node) => node.position.y));
    const bottomY = maxY + (isMobile ? 120 : 180);
    const spacing = isMobile ? 95 : 130;

    completedNodes.forEach((node, index) => {
        node.position = {
            ...node.position,
            y: bottomY - (index * spacing),
        };
    });

    const nodeMap = new Map(remappedNodes.map((node) => [node.id, node]));
    const minGap = isMobile ? 95 : 130;

    const enforceChildrenBelow = (nodeId) => {
        const childIds = childrenById?.get(nodeId) || [];
        const parentNode = nodeMap.get(nodeId);
        if (!parentNode || childIds.length === 0) return;

        childIds.forEach((childId) => {
            const childNode = nodeMap.get(childId);
            if (!childNode) return;

            if (childNode.position.y < parentNode.position.y + minGap) {
                childNode.position = {
                    ...childNode.position,
                    y: parentNode.position.y + minGap,
                };
            }

            enforceChildrenBelow(childId);
        });
    };

    remappedNodes.forEach((node) => {
        if (!parentById?.has(node.id)) {
            enforceChildrenBelow(node.id);
        }
    });

    return remappedNodes;
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
    const effectiveEvidenceGoalIds = evidenceGoalIds || deriveEvidenceGoalIds(sessions, activities, activityGroups);
    const activeLineageIds = getActiveLineageIds(effectiveEvidenceGoalIds, treeMaps.parentById);
    const inactiveNodeIds = getInactiveNodeIds(treeMaps.nodeById, treeMaps.childrenById, effectiveEvidenceGoalIds);

    const { nodes: rawNodes, edges: rawEdges, visibleNodeIds } = convertTreeToFlow(
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor
    );

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, 'TB', isMobile);

    const visibleCompletedIds = treeMaps.completedGoals
        .map((entry) => entry.id)
        .filter((id) => visibleNodeIds.has(id));

    const remappedNodes = applyCompletionJourneyYRemap(
        layoutedNodes,
        visibleCompletedIds,
        normalizedSettings.showCompletionJourney,
        isMobile,
        treeMaps.parentById,
        treeMaps.childrenById,
    );

    const nodeStyleMap = new Map();
    const frozenNodeIds = new Set();
    remappedNodes.forEach((node) => {
        const isActive = activeLineageIds.has(node.id);
        const isInactive = inactiveNodeIds.has(node.id);
        const isFrozen = Boolean(node.data?.frozen);
        const shouldFadeInactive = isInactive && !isActive;
        const shouldFade = normalizedSettings.fadeInactiveBranches && (shouldFadeInactive || isFrozen);

        if (isFrozen) {
            frozenNodeIds.add(node.id);
        }

        if (shouldFade) {
            nodeStyleMap.set(node.id, {
                opacity: isFrozen ? 0.34 : 0.22,
                transition: 'opacity 140ms ease-in-out',
            });
        }
    });

    const nodes = remappedNodes.map((node) => {
        const style = nodeStyleMap.get(node.id);
        if (!style) return node;
        return { ...node, style };
    });

    const baseEdges = layoutedEdges.map((edge) => {
        const sourceId = toId(edge.source);
        const targetId = toId(edge.target);
        const isActiveEdge = normalizedSettings.highlightActiveBranches
            && activeLineageIds.has(sourceId)
            && activeLineageIds.has(targetId);

        const shouldFadeEdge = normalizedSettings.fadeInactiveBranches
            && (
                frozenNodeIds.has(targetId)
                || (inactiveNodeIds.has(targetId) && !isActiveEdge)
            );

        const nextClassName = [
            edge.className,
            isActiveEdge ? 'active-branch-edge' : '',
            shouldFadeEdge ? 'faded-edge' : '',
        ].filter(Boolean).join(' ');

        const style = { ...(edge.style || {}) };
        if (isActiveEdge) {
            style.stroke = 'var(--color-brand-secondary, #ff9f1a)';
            style.strokeWidth = isMobile ? 2.8 : 3.2;
            style.opacity = 1;
            style.zIndex = 3;
        } else if (shouldFadeEdge) {
            style.opacity = frozenNodeIds.has(targetId) ? 0.26 : 0.16;
            style.strokeWidth = 1;
        }

        return {
            ...edge,
            className: nextClassName,
            style,
        };
    });

    const journeyEdges = [];
    if (normalizedSettings.showCompletionJourney) {
        for (let index = 0; index < visibleCompletedIds.length - 1; index += 1) {
            const source = visibleCompletedIds[index];
            const target = visibleCompletedIds[index + 1];
            journeyEdges.push({
                id: `journey-${source}-${target}-${index}`,
                source,
                target,
                type: 'straight',
                className: 'journey-edge',
                style: {
                    stroke: 'var(--color-brand-primary, #38bdf8)',
                    strokeWidth: isMobile ? 2 : 2.5,
                    strokeDasharray: '7 4',
                    opacity: 0.95,
                    zIndex: 5,
                },
            });
        }
    }

    const metrics = buildGraphMetricsFromSummary(
        rawNodes,
        visibleNodeIds,
        activeLineageIds,
        inactiveNodeIds,
        activities,
        activityGroups,
        programs || [],
        metricsSummary
    );

    return {
        nodes,
        edges: [...baseEdges, ...journeyEdges],
        metrics,
    };
};
