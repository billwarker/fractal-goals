import dagre from '@dagrejs/dagre';

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

    // Keep siblings in insertion order (children are pre-sorted by the level's
    // sort_children_by). This also reproduces the pre-@dagrejs/dagre layout exactly.
    dagre.layout(dagreGraph, { disableOptimalOrderHeuristic: true });

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

