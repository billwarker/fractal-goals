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
import styles from './FlowTree.module.css';
import dagre from 'dagre';
import { isSMART } from './utils/smartHelpers';

import { useTheme } from './contexts/ThemeContext';
import GoalIcon from './components/atoms/GoalIcon';

// Custom node component matching the tree style
const CustomNode = ({ data }) => {
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics, getCompletionColor } = useTheme();
    const isCompleted = data.completed || false;
    const isSmartGoal = data.isSmart || false;

    // Determination for Completed vs Level-based styling
    const completionChar = getScopedCharacteristics('Completed') || { icon: 'check' };
    const levelChar = getScopedCharacteristics(data.type) || { icon: 'circle' };

    // Preserve level shape even when completed as per user feedback
    const config = (isCompleted ? { ...completionChar, icon: levelChar.icon } : levelChar);

    let fillColor = isCompleted ? getCompletionColor() : getGoalColor(data.type);

    // Check if it's an Ultimate Goal
    const isUltimate = data.type === 'UltimateGoal';

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
        } else if (absDays >= 30) {
            timeStr = `${(absDays / 30.44).toFixed(1)}mo`;
        } else {
            timeStr = `${Math.ceil(absDays)}d`;
        }

        return isPast ? `-${timeStr}` : timeStr;
    };

    const getCompletedDateLabel = () => {
        if (!data.completed_at) return null;
        const completedDate = new Date(data.completed_at);
        return `Completed: ${completedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    };

    const dueTime = getDueTime();
    const timingLabel = age ? `Age: ${age}` : null;

    // Get the cosmic color for SMART ring (gold if completed, otherwise goal level color)
    const smartRingColor = isCompleted ? getCompletionColor() : getGoalColor(data.type);

    // Get secondary color for SMART ring fill (the space between rings)
    const smartRingFillColor = isCompleted
        ? getGoalSecondaryColor('Completed')
        : getGoalSecondaryColor(data.type);

    // Simple hex to rgba helper
    const hexToRgba = (hex, alpha) => {
        if (!hex) return `rgba(255, 215, 0, ${alpha})`; // fallback gold
        let r = 0, g = 0, b = 0;
        // Handle shorthand #FFF
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const glowColor = isCompleted ? hexToRgba(fillColor, 0.6) : null;

    return (
        <div className={styles.nodeContainer}>
            {/* Goal Icon with handles positioned relative to it */}
            <div
                className={`${styles.nodeCircleWrapper}`}
                onClick={data.onClick}
                style={{
                    position: 'relative',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <GoalIcon
                    shape={config.icon}
                    color={fillColor}
                    secondaryColor={smartRingFillColor}
                    isSmart={isSmartGoal}
                    size={30}
                    className={isCompleted ? styles.nodeCircleCompleted : ''}
                    style={{
                        filter: isCompleted ? `drop-shadow(0 0 3px ${glowColor})` : undefined
                    }}
                />

                {/* Target Handle - centered on circle/icon */}
                <Handle
                    type="target"
                    position={Position.Top}
                    className={styles.handle}
                />

                {/* Source Handle - centered on circle/icon */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className={styles.handle}
                />
            </div>

            {/* Text beside circle */}
            <div className={styles.nodeTextContainer}>
                <div
                    className={`${styles.nodeLabel} ${isUltimate ? styles.nodeLabelUltimate : ''} ${data.label.length > 30 ? styles.nodeLabelLongText : ''}`}
                    style={{
                        color: isCompleted ? fillColor : 'var(--color-text-primary)',
                    }}
                    onClick={data.onClick}
                >
                    {data.label}
                </div>
                {
                    isCompleted ? (
                        <div
                            className={styles.completedDateLabel}
                            style={{ color: fillColor }}
                        >
                            {getCompletedDateLabel()}
                        </div>
                    ) : (timingLabel || dueTime) && (
                        <div className={styles.timingContainer}>
                            {timingLabel && <span>{timingLabel}</span>}
                            {timingLabel && dueTime && <span className={styles.timingSeparator}>|</span>}
                            {dueTime && (
                                <span className={dueTime.startsWith('-') ? styles.dueTimeOverdue : styles.dueTimeOnTime}>
                                    Due: {dueTime}
                                </span>
                            )}
                        </div>
                    )
                }
                {/* Add Child Button - for all goal types that can have children */}
                {
                    !isCompleted && data.onAddChild && data.childTypeName && (
                        <div
                            className={styles.addChildButton}
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onAddChild();
                            }}
                        >
                            + Add {data.childTypeName}
                        </div>
                    )
                }
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
const convertTreeToFlow = (treeData, onNodeClick, onAddChild, selectedNodeId = null, completedGoalColor = '#FFD700') => {
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
            const isCompleted = node.attributes?.completed || node.completed;
            edges.push({
                id: `${parentId}-${nodeId}-${isCompleted ? 'completed' : 'active'}`,
                source: String(parentId),
                target: nodeId,
                type: 'straight',
                className: isCompleted ? 'completed-edge' : '',
                style: {
                    stroke: isCompleted ? completedGoalColor : 'var(--color-connection-line)',
                    strokeWidth: isCompleted ? 2.5 : 1.5,
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
                completed_at: node.attributes?.completed_at,
                created_at: node.attributes?.created_at,
                deadline: node.attributes?.deadline,
                hasChildren: node.children && node.children.length > 0,
                isSmart: node.attributes?.is_smart || isSMART(node),
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

    const { getGoalColor } = useTheme();
    const completedGoalColor = getGoalColor('Completed');

    // Expose immediate fade-out function to parent
    React.useImperativeHandle(ref, () => ({
        startFadeOut: () => {
            setIsVisible(false);
        }
    }), []); // Empty deps - function never changes

    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
        if (!treeData) return { nodes: [], edges: [] };

        const { nodes, edges } = convertTreeToFlow(treeData, onNodeClick, onAddChild, selectedNodeId, completedGoalColor);
        return getLayoutedElements(nodes, edges);
    }, [treeData, onNodeClick, onAddChild, selectedNodeId, completedGoalColor]);

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

    // Re-center with fade transition when sidebar toggles or selected node changes
    useEffect(() => {
        if (rfInstance) {
            // Fade out first
            setIsVisible(false);

            // Wait for fade-out, then fit view, then fade back in
            const timer = setTimeout(() => {
                rfInstance.fitView({ padding: 0.2, duration: 200 });
                // Fade back in after fitView animation completes
                setTimeout(() => setIsVisible(true), 220);
            }, 220); // Wait for fade-out transition (200ms) + small buffer

            return () => clearTimeout(timer);
        }
    }, [sidebarOpen, selectedNodeId, rfInstance]);

    return (
        <div
            className={styles.flowTreeContainer}
            style={{ opacity: isVisible ? 1 : 0 }}
        >
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
                    style: { stroke: 'var(--color-connection-line)', strokeWidth: 1.5 }
                }}
                proOptions={{ hideAttribution: true }}
            >
            </ReactFlow>
        </div>
    );
});

export default FlowTree;
