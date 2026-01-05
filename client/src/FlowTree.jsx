import React, { useMemo, useEffect, useState } from 'react';
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
import { getGoalColor } from './utils/goalColors';

// Custom node component matching the tree style
const CustomNode = ({ data }) => {
    const isCompleted = data.completed || false;

    // Use cosmic color palette based on goal type
    let fillColor = getGoalColor(data.type);

    // Override with gold if completed
    if (isCompleted) {
        fillColor = "#FFD700"; // Gold for completed
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

    // Calculate due time if deadline exists
    const getDueTime = () => {
        if (!data.deadline) return null;
        const deadlineDate = new Date(data.deadline);
        const now = new Date();
        const diffMs = deadlineDate - now;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        const isPast = diffDays < 0;
        const absDays = Math.abs(diffDays);

        let timeStr;
        if (absDays >= 365) {
            timeStr = `${(absDays / 365).toFixed(1)}y`;
        } else if (absDays >= 30 || absDays > 7) {
            timeStr = `${(absDays / 30.44).toFixed(1)}mo`;
        } else if (absDays > 6) {
            timeStr = `${(absDays / 7).toFixed(1)}w`;
        } else {
            timeStr = `${Math.floor(absDays)}d`;
        }

        return isPast ? `-${timeStr}` : timeStr;
    };

    const dueTime = getDueTime();
    const timingLabel = age ? `Age: ${age}` : null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                position: 'relative',
            }}
        >
            {/* Circle with handles positioned relative to it */}
            <div
                style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: fillColor,
                    border: '2px solid #fff',
                    boxShadow: isCompleted
                        ? '0 0 10px rgba(255, 215, 0, 0.6)'
                        : '0 2px 4px rgba(0,0,0,0.3)',
                    flexShrink: 0,
                    zIndex: 2,
                    position: 'relative', // Handles are positioned relative to this circle
                }}
                onClick={data.onClick}
            >
                {/* Target Handle - centered on circle */}
                <Handle
                    type="target"
                    position={Position.Top}
                    style={{
                        top: '50%',
                        left: '50%',
                        background: 'transparent',
                        border: 'none',
                        transform: 'translate(-50%, -50%)',
                        width: '1px',
                        height: '1px',
                        zIndex: 0
                    }}
                />

                {/* Source Handle - centered on circle */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    style={{
                        top: '50%',
                        left: '50%',
                        background: 'transparent',
                        border: 'none',
                        transform: 'translate(-50%, -50%)',
                        width: '1px',
                        height: '1px',
                        zIndex: 0
                    }}
                />
            </div>

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
                        whiteSpace: data.label.length > 30 ? 'normal' : 'nowrap',
                        wordBreak: 'keep-all',
                        overflowWrap: 'break-word',
                        maxWidth: '200px',
                        lineHeight: '1.3',
                    }}
                    onClick={data.onClick}
                >
                    {data.label}
                </div>
                {(timingLabel || dueTime) && (
                    <div
                        style={{
                            color: '#fff',
                            fontSize: '12px',
                            marginTop: '2px',
                            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center'
                        }}
                    >
                        {timingLabel && <span>{timingLabel}</span>}
                        {timingLabel && dueTime && <span style={{ margin: '0 6px' }}>|</span>}
                        {dueTime && (
                            <span style={{
                                color: dueTime.startsWith('-') ? '#ff5252' : '#4caf50',
                                fontWeight: 'bold'
                            }}>
                                Due: {dueTime}
                            </span>
                        )}
                    </div>
                )}
                {/* Add Child Button - for all goal types that can have children */}
                {data.onAddChild && data.childTypeName && (
                    <div
                        style={{
                            color: '#ff9800',
                            fontSize: '11px',
                            marginTop: '4px',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onAddChild();
                        }}
                    >
                        + Add {data.childTypeName}
                    </div>
                )}
            </div>
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

// Helper function to get full lineage (ancestors + selected + descendants)
const getLineagePath = (treeData, targetNodeId) => {
    const lineageIds = new Set();

    // Find the target node and collect ancestors
    const findNodeAndAncestors = (node, targetId, currentPath = []) => {
        if (!node) return null;

        const nodeId = String(node.id || node.attributes?.id);
        const newPath = [...currentPath, nodeId];

        // Found the target node
        if (nodeId === targetId) {
            return { node, path: newPath };
        }

        // Search in children
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                const result = findNodeAndAncestors(child, targetId, newPath);
                if (result) return result;
            }
        }

        return null;
    };

    // Collect all descendants from a node
    const collectDescendants = (node, descendants = new Set()) => {
        if (!node) return descendants;

        const nodeId = String(node.id || node.attributes?.id);
        descendants.add(nodeId);

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectDescendants(child, descendants));
        }

        return descendants;
    };

    const result = findNodeAndAncestors(treeData, String(targetNodeId));
    if (result) {
        // Add all ancestors (the path to the target)
        result.path.forEach(id => lineageIds.add(id));

        // Add all descendants of the target node
        collectDescendants(result.node, lineageIds);
    }

    return lineageIds;
};

// Convert tree data to ReactFlow format
const convertTreeToFlow = (treeData, onNodeClick, onAddChild, selectedNodeId = null) => {
    const nodes = [];
    const edges = [];
    const addedNodeIds = new Set();

    // Get lineage path (ancestors + descendants) if a node is selected
    const lineagePath = selectedNodeId ? getLineagePath(treeData, selectedNodeId) : null;

    // Helper to get child type name
    const getChildType = (parentType) => {
        const map = {
            'UltimateGoal': 'LongTermGoal',
            'LongTermGoal': 'MidTermGoal',
            'MidTermGoal': 'ShortTermGoal',
            'ShortTermGoal': 'ImmediateGoal',
            'ImmediateGoal': 'MicroGoal',
            'MicroGoal': 'NanoGoal',
            'NanoGoal': null
        };
        return map[parentType];
    };

    const getTypeDisplayName = (type) => {
        const names = {
            'LongTermGoal': 'Long Term Goal',
            'MidTermGoal': 'Mid Term Goal',
            'ShortTermGoal': 'Short Term Goal',
            'ImmediateGoal': 'Immediate Goal',
            'MicroGoal': 'Micro Goal',
            'NanoGoal': 'Nano Goal',
        };
        return names[type] || type;
    };

    const traverse = (node, parentId = null) => {
        if (!node) return;

        const rawNodeId = node.id || node.attributes?.id;
        if (!rawNodeId) return;

        const nodeId = String(rawNodeId);

        // Add Node only if unique
        if (addedNodeIds.has(nodeId)) {
            return;
        }

        // Skip nodes not in lineage path if filtering is active
        if (lineagePath && !lineagePath.has(nodeId)) {
            return;
        }

        addedNodeIds.add(nodeId);

        // Add Edges
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

        const nodeType = node.attributes?.type || node.type;
        const childType = getChildType(nodeType);
        const childTypeName = childType ? getTypeDisplayName(childType) : null;

        nodes.push({
            id: nodeId,
            type: 'custom',
            // Default position required by ReactFlow, overridden by dagre layout
            position: { x: 0, y: 0 },
            data: {
                label: node.name,
                type: nodeType,
                completed: node.attributes?.completed,
                created_at: node.attributes?.created_at,
                deadline: node.attributes?.deadline,
                hasChildren: node.children && node.children.length > 0,
                onClick: () => onNodeClick(node),
                onAddChild: childType ? () => onAddChild(node) : null,
                childTypeName: childTypeName,
            },
        });

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child, nodeId));
        }
    };

    traverse(treeData);

    return { nodes, edges };
};

const FlowTree = React.forwardRef(({ treeData, onNodeClick, onAddChild, sidebarOpen, selectedNodeId }, ref) => {
    const [rfInstance, setRfInstance] = useState(null);
    const [isVisible, setIsVisible] = useState(false);

    // Expose immediate fade-out function to parent
    React.useImperativeHandle(ref, () => ({
        startFadeOut: () => {
            setIsVisible(false);
        }
    }), []); // Empty deps - function never changes

    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
        if (!treeData) return { nodes: [], edges: [] };

        const { nodes, edges } = convertTreeToFlow(treeData, onNodeClick, onAddChild, selectedNodeId);
        return getLayoutedElements(nodes, edges);
    }, [treeData, onNodeClick, onAddChild, selectedNodeId]);

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

    // Sync React Flow state when layout changes
    useEffect(() => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

    // Center graph on initial mount (with delay for container width transition)
    useEffect(() => {
        if (rfInstance) {
            setIsVisible(false); // Hide during centering
            const timer = setTimeout(() => {
                rfInstance.fitView({ padding: 0.2, duration: 200 });
                // Show after fitView completes
                setTimeout(() => setIsVisible(true), 200);
            }, 100); // Minimal delay for layout settling
            return () => clearTimeout(timer);
        }
    }, [rfInstance]);

    // Re-center when nodes are laid out (handles initial load and view switches)
    useEffect(() => {
        if (rfInstance && layoutedNodes.length > 0) {
            requestAnimationFrame(() => {
                rfInstance.fitView({ padding: 0.2, duration: 200 });
            });
        }
    }, [layoutedNodes.length, rfInstance]);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 200ms ease-in-out'
        }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                onInit={setRfInstance}
                fitView
                attributionPosition="bottom-left"
                minZoom={0.1}
                maxZoom={2}
                nodesConnectable={false}
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
});

export default FlowTree;
