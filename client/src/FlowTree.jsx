import React, { useMemo, useEffect } from 'react';
import ReactFlow, {
    Background,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './FlowTree.css';
import dagre from 'dagre';

// Custom node component matching the tree style
const CustomNode = ({ data }) => {
    const isPracticeSession = data.type === 'PracticeSession' || data.__isPracticeSession;
    const isCompleted = data.completed || false;

    let fillColor = "#2196f3"; // Default blue

    // Priority: Completed (Gold) > Practice Session (Orange) > Has Children (Green) > Default (Blue)
    if (isCompleted) {
        fillColor = "#FFD700"; // Gold for completed
    } else if (isPracticeSession) {
        fillColor = "#ff9800"; // Orange for practice sessions
    } else if (data.hasChildren) {
        fillColor = "#4caf50"; // Green for nodes with children
    }

    // Calculate age if created_at exists
    const getAge = () => {
        if (!data.created_at) return null;
        const created = new Date(data.created_at);
        const now = new Date();
        const diffMs = now - created;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 7) return `${diffDays}d`;
        if (diffDays < 30) return `${(diffDays / 7).toFixed(1)}w`;
        if (diffDays < 365) return `${(diffDays / 30).toFixed(1)}m`;
        return `${(diffDays / 365).toFixed(1)}y`;
    };

    const age = getAge();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                position: 'relative', // Ensure handles are positioned relative to this
            }}
            onClick={data.onClick}
        >
            {/* Target Handle (Centered hidden behind circle) */}
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    top: 15, // Center vertical (half of 30px)
                    left: 15, // Center horizontal
                    background: 'transparent',
                    border: 'none',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 0
                }}
            />

            {/* Circle */}
            <div
                style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: fillColor,
                    border: '2px solid #fff',
                    // Removed opacity, added subtle glow for gold
                    boxShadow: isCompleted
                        ? '0 0 10px rgba(255, 215, 0, 0.6)'
                        : '0 2px 4px rgba(0,0,0,0.3)',
                    flexShrink: 0,
                    zIndex: 2, // Ensure circle sits ABOVE the connecting lines
                    position: 'relative'
                }}
            />

            {/* Text beside circle */}
            <div
                style={{
                    marginLeft: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                }}
            >
                <div
                    style={{
                        color: '#e0e0e0',
                        fontSize: '14px',
                        fontWeight: '600',
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {data.label}
                </div>
                {age && (
                    <div
                        style={{
                            color: '#fff',
                            fontSize: '12px',
                            marginTop: '2px',
                            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        }}
                    >
                        {age}
                    </div>
                )}
            </div>

            {/* Source Handle (Centered hidden behind circle) */}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    top: 15, // Center vertical
                    left: 15, // Center horizontal
                    background: 'transparent',
                    border: 'none',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 0
                }}
            />
        </div>
    );
};

const nodeTypes = {
    custom: CustomNode,
};

// Dagre layout algorithm for tree structure
const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Width/height should account for the node display size + margin
    const nodeWidth = 250;
    const nodeHeight = 80;

    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 100,
        ranksep: 100,
        marginx: 50,
        marginy: 50,
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

// Convert tree data to ReactFlow format
const convertTreeToFlow = (treeData, onNodeClick) => {
    const nodes = [];
    const edges = [];
    const addedNodeIds = new Set();

    const traverse = (node, parentId = null) => {
        if (!node) return;

        const rawNodeId = node.id || node.attributes?.id;
        if (!rawNodeId) return;

        const nodeId = String(rawNodeId);

        // Always add Edge connecting to parent (even if node was already added)
        if (parentId) {
            edges.push({
                id: `${parentId}-${nodeId}`,
                source: String(parentId),
                target: nodeId,
                type: 'straight',
                style: {
                    stroke: '#ffffff',
                    strokeWidth: 1.5,
                },
            });
        }

        // Add Node only if unique
        if (addedNodeIds.has(nodeId)) {
            return;
        }
        addedNodeIds.add(nodeId);

        const isPracticeSession = node.__isPracticeSession || node.attributes?.type === 'PracticeSession';

        nodes.push({
            id: nodeId,
            type: 'custom',
            // Default position required by ReactFlow, overridden by dagre layout
            position: { x: 0, y: 0 },
            data: {
                label: node.name,
                type: node.attributes?.type,
                completed: node.attributes?.completed,
                created_at: node.attributes?.created_at,
                hasChildren: node.children && node.children.length > 0,
                __isPracticeSession: isPracticeSession,
                onClick: () => onNodeClick(node),
            },
        });

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child, nodeId));
        }
    };

    traverse(treeData);

    return { nodes, edges };
};

const FlowTree = ({ treeData, onNodeClick, selectedPracticeSession }) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
        if (!treeData) return { nodes: [], edges: [] };

        // Inject practice session if selected
        let dataToConvert = treeData;
        if (selectedPracticeSession) {
            dataToConvert = JSON.parse(JSON.stringify(treeData));
            const parentIds = selectedPracticeSession.attributes?.parent_ids || [];

            // Add practice session under ALL parents (network graph handles this!)
            for (const parentId of parentIds) {
                const findAndAdd = (node) => {
                    if (!node) return false;
                    const nodeId = node.id || node.attributes?.id;

                    if (nodeId === parentId) {
                        if (!node.children) node.children = [];
                        const alreadyExists = node.children.some(c => c.id === selectedPracticeSession.id);
                        if (!alreadyExists) {
                            node.children.push({
                                ...selectedPracticeSession,
                                __isPracticeSession: true,
                            });
                        }
                        return true;
                    }

                    if (node.children) {
                        for (const child of node.children) {
                            if (findAndAdd(child)) return true;
                        }
                    }
                    return false;
                };

                findAndAdd(dataToConvert);
            }
        }

        const { nodes, edges } = convertTreeToFlow(dataToConvert, onNodeClick);
        return getLayoutedElements(nodes, edges);
    }, [treeData, onNodeClick, selectedPracticeSession]);

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

    // Sync React Flow state when layout changes
    useEffect(() => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-left"
                minZoom={0.1}
                maxZoom={2}
                defaultEdgeOptions={{
                    type: 'straight',
                    style: { stroke: '#ffffff', strokeWidth: 1.5 }
                }}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#333" gap={20} />
            </ReactFlow>
        </div>
    );
};

export default FlowTree;
