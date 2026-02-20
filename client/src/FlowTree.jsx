import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, {
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
import useIsMobile from './hooks/useIsMobile';

const DEFAULT_VIEW_SETTINGS = {
    highlightActiveBranches: false,
    fadeInactiveBranches: false,
    showCompletionJourney: false,
};

const toId = (value) => (value == null ? null : String(value));

const CustomNode = ({ data }) => {
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics, getCompletionColor } = useTheme();
    const isCompleted = data.completed || false;
    const isSmartGoal = data.isSmart || false;

    const completionChar = getScopedCharacteristics('Completed') || { icon: 'check' };
    const levelChar = getScopedCharacteristics(data.type) || { icon: 'circle' };
    const config = (isCompleted ? { ...completionChar, icon: levelChar.icon } : levelChar);

    const fillColor = isCompleted ? getCompletionColor() : getGoalColor(data.type);
    const isUltimate = data.type === 'UltimateGoal';

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

    const age = getAge();
    const dueTime = getDueTime();
    const timingLabel = age ? `Age: ${age}` : null;

    const smartRingFillColor = isCompleted
        ? getGoalSecondaryColor('Completed')
        : getGoalSecondaryColor(data.type);

    const hexToRgba = (hex, alpha) => {
        if (!hex) return `rgba(255, 215, 0, ${alpha})`;
        let r = 0;
        let g = 0;
        let b = 0;
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

                <Handle
                    type="target"
                    position={Position.Top}
                    className={styles.handle}
                />

                <Handle
                    type="source"
                    position={Position.Bottom}
                    className={styles.handle}
                />
            </div>

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

const getLayoutedElements = (nodes, edges, direction = 'TB', compact = false) => {
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

const getLineagePath = (treeData, targetNodeId) => {
    const lineageIds = new Set();

    const findNodeAndAncestors = (node, targetId, currentPath = []) => {
        if (!node) return null;

        const nodeId = toId(node.id || node.attributes?.id);
        if (!nodeId) return null;

        const newPath = [...currentPath, nodeId];
        if (nodeId === targetId) {
            return { node, path: newPath };
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
            for (const child of node.children) {
                const result = findNodeAndAncestors(child, targetId, newPath);
                if (result) return result;
            }
        }

        return null;
    };

    const collectDescendants = (node, descendants = new Set()) => {
        if (!node) return descendants;

        const nodeId = toId(node.id || node.attributes?.id);
        if (nodeId) descendants.add(nodeId);

        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach((child) => collectDescendants(child, descendants));
        }

        return descendants;
    };

    const result = findNodeAndAncestors(treeData, toId(targetNodeId));
    if (result) {
        result.path.forEach((id) => lineageIds.add(id));
        collectDescendants(result.node, lineageIds);
    }

    return lineageIds;
};

const getChildType = (parentType) => {
    const map = {
        UltimateGoal: 'LongTermGoal',
        LongTermGoal: 'MidTermGoal',
        MidTermGoal: 'ShortTermGoal',
        ShortTermGoal: 'ImmediateGoal',
        ImmediateGoal: 'MicroGoal',
        MicroGoal: 'NanoGoal',
        NanoGoal: null,
    };
    return map[parentType];
};

const getTypeDisplayName = (type) => {
    const names = {
        LongTermGoal: 'Long Term Goal',
        MidTermGoal: 'Mid Term Goal',
        ShortTermGoal: 'Short Term Goal',
        ImmediateGoal: 'Immediate Goal',
        MicroGoal: 'Micro Goal',
        NanoGoal: 'Nano Goal',
    };
    return names[type] || type;
};

const buildTreeMaps = (treeData) => {
    const parentById = new Map();
    const childrenById = new Map();
    const nodeById = new Map();
    const completedGoals = [];

    const traverse = (node, parentId = null) => {
        if (!node) return;
        const nodeId = toId(node.id || node.attributes?.id);
        if (!nodeId) return;

        nodeById.set(nodeId, node);
        if (!childrenById.has(nodeId)) childrenById.set(nodeId, []);
        if (parentId) {
            parentById.set(nodeId, parentId);
            const siblings = childrenById.get(parentId) || [];
            siblings.push(nodeId);
            childrenById.set(parentId, siblings);
        }

        const completedAt = node.attributes?.completed_at || node.completed_at;
        const completed = Boolean(node.attributes?.completed || node.completed);
        if (completed && completedAt) {
            const timestamp = Date.parse(completedAt);
            if (!Number.isNaN(timestamp)) {
                completedGoals.push({ id: nodeId, completedAt, timestamp });
            }
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach((child) => traverse(child, nodeId));
        }
    };

    traverse(treeData);

    completedGoals.sort((a, b) => a.timestamp - b.timestamp);

    return { parentById, childrenById, nodeById, completedGoals };
};

const convertTreeToFlow = (treeData, onNodeClick, onAddChild, selectedNodeId = null, completedGoalColor = '#FFD700') => {
    const nodes = [];
    const edges = [];
    const addedNodeIds = new Set();
    const visibleNodeIds = new Set();

    const lineagePath = selectedNodeId ? getLineagePath(treeData, selectedNodeId) : null;

    const traverse = (node, parentId = null) => {
        if (!node) return;

        const rawNodeId = node.id || node.attributes?.id;
        const nodeId = toId(rawNodeId);
        if (!nodeId) return;

        if (addedNodeIds.has(nodeId)) return;
        if (lineagePath && !lineagePath.has(nodeId)) return;

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

        const nodeType = node.attributes?.type || node.type;
        const childType = getChildType(nodeType);
        const childTypeName = childType ? getTypeDisplayName(childType) : null;

        nodes.push({
            id: nodeId,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
                label: node.name,
                type: nodeType,
                completed: node.attributes?.completed,
                completed_at: node.attributes?.completed_at,
                created_at: node.attributes?.created_at,
                deadline: node.attributes?.deadline,
                hasChildren: Array.isArray(node.children) && node.children.length > 0,
                isSmart: node.attributes?.is_smart || isSMART(node),
                onClick: () => onNodeClick(node),
                onAddChild: childType ? () => onAddChild(node) : null,
                childTypeName,
            },
        });

        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach((child) => traverse(child, nodeId));
        }
    };

    traverse(treeData);

    return { nodes, edges, visibleNodeIds };
};

const deriveEvidenceGoalIds = (sessions = [], activities = [], activityGroups = []) => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const safeActivities = Array.isArray(activities) ? activities : [];
    const safeActivityGroups = Array.isArray(activityGroups) ? activityGroups : [];

    // 1. Map Activity ID -> Goal IDs
    const goalsByActivityId = new Map();
    // Also track which group an activity belongs to
    const groupIdByActivityId = new Map();

    safeActivities.forEach((activity) => {
        const activityId = toId(activity?.id);
        if (!activityId) return;

        const associatedGoalIds = Array.isArray(activity?.associated_goal_ids)
            ? activity.associated_goal_ids.map((goalId) => toId(goalId)).filter(Boolean)
            : [];
        goalsByActivityId.set(activityId, associatedGoalIds);

        if (activity?.group_id) {
            groupIdByActivityId.set(activityId, toId(activity.group_id));
        }
    });

    // 2. Map Activity Group ID -> Goal IDs
    const goalsByGroupId = new Map();
    safeActivityGroups.forEach((group) => {
        const groupId = toId(group?.id);
        if (!groupId) return;

        const associatedGoalIds = Array.isArray(group?.associated_goal_ids)
            ? group.associated_goal_ids.map((goalId) => toId(goalId)).filter(Boolean)
            : [];
        goalsByGroupId.set(groupId, associatedGoalIds);
    });

    const evidenceGoalIds = new Set();
    let hasInstanceEvidence = false;

    // 3. Process completed sessions & instances
    safeSessions.forEach((session) => {
        if (!session?.completed) return;
        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];

        instances.forEach((instance) => {
            if (!instance?.completed) return;
            const activityDefinitionId = toId(instance?.activity_definition_id);
            if (!activityDefinitionId) return;

            // Direct activity evidence
            const directGoalIds = goalsByActivityId.get(activityDefinitionId) || [];
            directGoalIds.forEach((goalId) => {
                evidenceGoalIds.add(goalId);
                hasInstanceEvidence = true;
            });

            // Group-based evidence
            const groupId = groupIdByActivityId.get(activityDefinitionId);
            if (groupId) {
                const groupGoalIds = goalsByGroupId.get(groupId) || [];
                groupGoalIds.forEach((goalId) => {
                    evidenceGoalIds.add(goalId);
                    hasInstanceEvidence = true;
                });
            }
        });
    });

    // 4. Fallback: If no instance evidence resolved AT ALL, check session-level goals directly.
    // This prevents highlighting the entire tree if direct mapping fails, but handles
    // cases where old data doesn't map to activities well.
    if (!hasInstanceEvidence) {
        safeSessions.forEach((session) => {
            if (!session?.completed) return;

            const shortTermGoals = Array.isArray(session.short_term_goals) ? session.short_term_goals : [];
            const immediateGoals = Array.isArray(session.immediate_goals) ? session.immediate_goals : [];

            shortTermGoals.forEach((goal) => {
                const gid = toId(goal?.id);
                if (gid) evidenceGoalIds.add(gid);
            });

            immediateGoals.forEach((goal) => {
                const gid = toId(goal?.id);
                if (gid) evidenceGoalIds.add(gid);
            });
        });
    }

    return evidenceGoalIds;
};

const getActiveLineageIds = (evidenceGoalIds, parentById) => {
    const activeNodeIds = new Set();

    evidenceGoalIds.forEach((goalId) => {
        let current = goalId;
        while (current) {
            activeNodeIds.add(current);
            current = parentById.get(current) || null;
        }
    });

    return activeNodeIds;
};

const getInactiveNodeIds = (nodeById, childrenById, evidenceGoalIds) => {
    const memo = new Map();

    const hasEvidenceInSubtree = (nodeId) => {
        if (memo.has(nodeId)) return memo.get(nodeId);

        if (evidenceGoalIds.has(nodeId)) {
            memo.set(nodeId, true);
            return true;
        }

        const childIds = childrenById.get(nodeId) || [];
        const found = childIds.some((childId) => hasEvidenceInSubtree(childId));
        memo.set(nodeId, found);
        return found;
    };

    const inactiveNodeIds = new Set();
    nodeById.forEach((_, nodeId) => {
        if (!hasEvidenceInSubtree(nodeId)) {
            inactiveNodeIds.add(nodeId);
        }
    });

    return inactiveNodeIds;
};

const applyCompletionJourneyYRemap = (nodes, orderedCompletedIds, enabled, isMobile) => {
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

    return remappedNodes;
};

const deriveGraphMetrics = (
    rawNodes,
    visibleNodeIds,
    activeLineageIds,
    inactiveNodeIds,
    sessions,
    activities,
    activityGroups,
    programs
) => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const safeActivities = Array.isArray(activities) ? activities : [];
    const safeActivityGroups = Array.isArray(activityGroups) ? activityGroups : [];
    const safePrograms = Array.isArray(programs) ? programs : [];

    // ROW 1: Goals
    const totalGoals = rawNodes.length;
    const completedGoals = rawNodes.filter((n) => n.data.completed).length;
    const pctCompleted = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    const smartGoals = rawNodes.filter((n) => n.data.isSmart).length;
    const pctSmart = totalGoals > 0 ? Math.round((smartGoals / totalGoals) * 100) : 0;

    const goalsByActivityId = new Map();
    const groupIdByActivityId = new Map();
    safeActivities.forEach((a) => {
        const id = toId(a.id);
        goalsByActivityId.set(id, Array.isArray(a.associated_goal_ids) ? a.associated_goal_ids.map(toId) : []);
        if (a.group_id) groupIdByActivityId.set(id, toId(a.group_id));
    });

    const goalsByGroupId = new Map();
    safeActivityGroups.forEach((g) => {
        goalsByGroupId.set(toId(g.id), Array.isArray(g.associated_goal_ids) ? g.associated_goal_ids.map(toId) : []);
    });

    const instanceMapsToVisible = (instance) => {
        const defId = toId(instance?.activity_definition_id);
        if (!defId) return false;

        const directGoals = goalsByActivityId.get(defId) || [];
        if (directGoals.some((gId) => visibleNodeIds.has(gId))) return true;

        const groupId = groupIdByActivityId.get(defId);
        if (groupId) {
            const groupGoals = goalsByGroupId.get(groupId) || [];
            if (groupGoals.some((gId) => visibleNodeIds.has(gId))) return true;
        }
        return false;
    };

    const sessionMapsToVisible = (session) => {
        if (!session) return false;

        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];
        if (instances.some((inst) => instanceMapsToVisible(inst))) return true;

        const stGoals = Array.isArray(session.short_term_goals) ? session.short_term_goals : [];
        const immGoals = Array.isArray(session.immediate_goals) ? session.immediate_goals : [];

        if (stGoals.some((g) => visibleNodeIds.has(toId(g.id)))) return true;
        if (immGoals.some((g) => visibleNodeIds.has(toId(g.id)))) return true;

        return false;
    };

    let associatedActivitiesCount = 0;
    safeActivities.forEach((a) => {
        const id = toId(a.id);
        const directGoals = goalsByActivityId.get(id) || [];
        if (directGoals.some((gId) => visibleNodeIds.has(gId))) {
            associatedActivitiesCount += 1;
            return;
        }
        const groupId = groupIdByActivityId.get(id);
        if (groupId) {
            const groupGoals = goalsByGroupId.get(groupId) || [];
            if (groupGoals.some((gId) => visibleNodeIds.has(gId))) {
                associatedActivitiesCount += 1;
            }
        }
    });

    let completedSessionsCount = 0;
    let completedInstancesCount = 0;
    let totalSessionDuration = 0;
    let totalInstanceDuration = 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let recentSessionsCount = 0;
    let recentInstancesCount = 0;
    let recentSessionDuration = 0;

    let programSessionsCount = 0;
    let recentProgramSessionsCount = 0;

    safeSessions.forEach((session) => {
        // Evaluate activity instances independently of session completion
        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];
        instances.forEach((inst) => {
            if (!inst.completed) return;
            if (!instanceMapsToVisible(inst)) return;

            completedInstancesCount += 1;
            totalInstanceDuration += (inst.duration_seconds || 0);

            const instEnd = new Date(inst.time_stop || inst.updated_at || inst.created_at || now);
            if (instEnd >= sevenDaysAgo) {
                recentInstancesCount += 1;
            }
        });

        // Now evaluate session-level metrics
        if (!session.completed) return;
        if (!sessionMapsToVisible(session)) return;

        completedSessionsCount += 1;
        totalSessionDuration += (session.total_duration_seconds || 0);

        const sessionEnd = new Date(session.session_end || session.completed_at || session.created_at);
        const isRecent = sessionEnd >= sevenDaysAgo;

        if (isRecent) {
            recentSessionsCount += 1;
            recentSessionDuration += (session.total_duration_seconds || 0);
        }

        if (session.program_day_id) {
            programSessionsCount += 1;
            if (isRecent) recentProgramSessionsCount += 1;
        }
    });

    const activeVisibleNodesCount = Array.from(visibleNodeIds).filter((id) => activeLineageIds.has(id)).length;
    const inactiveVisibleNodesCount = Array.from(visibleNodeIds).filter((id) => inactiveNodeIds.has(id)).length;

    const recentCompletedGoalsCount = rawNodes.filter((n) => {
        if (!n.data.completed || !n.data.completed_at) return false;
        return new Date(n.data.completed_at) >= sevenDaysAgo;
    }).length;

    const activeProgramGoalIds = new Set();
    safePrograms.forEach((prog) => {
        if (!prog.is_active) return;
        const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];
        blocks.forEach((b) => {
            const gIds = Array.isArray(b.goal_ids) ? b.goal_ids : [];
            gIds.forEach((id) => activeProgramGoalIds.add(toId(id)));
        });
        const pGoals = Array.isArray(prog.goal_ids) ? prog.goal_ids : [];
        pGoals.forEach((id) => activeProgramGoalIds.add(toId(id)));
    });

    const goalsInActiveProgramCount = rawNodes.filter((n) => activeProgramGoalIds.has(n.id) && visibleNodeIds.has(n.id)).length;
    const programFocusEfficiency = recentSessionsCount > 0
        ? Math.round((recentProgramSessionsCount / recentSessionsCount) * 100)
        : 0;

    const formatDuration = (seconds) => {
        if (!seconds) return '0h';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return {
        row1: {
            totalGoals,
            completedGoals,
            pctCompleted,
            pctSmart
        },
        row2: {
            completedSessionsCount,
            associatedActivitiesCount,
            completedInstancesCount,
            totalSessionDuration: formatDuration(totalSessionDuration),
            totalInstanceDuration: formatDuration(totalInstanceDuration)
        },
        row3: {
            activeVisibleNodesCount,
            inactiveVisibleNodesCount
        },
        row4: {
            recentSessionsCount,
            recentInstancesCount,
            recentSessionDuration: formatDuration(recentSessionDuration),
            recentCompletedGoalsCount
        },
        row5: {
            goalsInActiveProgramCount,
            programSessionsCount,
            programFocusEfficiency
        }
    };
};

const buildGraphPresentation = ({
    treeData,
    onNodeClick,
    onAddChild,
    selectedNodeId,
    completedGoalColor,
    viewSettings,
    sessions,
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
    const evidenceGoalIds = deriveEvidenceGoalIds(sessions, activities, activityGroups);
    const hasAnyEvidence = evidenceGoalIds.size > 0;

    const activeLineageIds = getActiveLineageIds(evidenceGoalIds, treeMaps.parentById);
    const inactiveNodeIds = getInactiveNodeIds(treeMaps.nodeById, treeMaps.childrenById, evidenceGoalIds);

    const { nodes: rawNodes, edges: rawEdges, visibleNodeIds } = convertTreeToFlow(
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
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
    );

    const nodeStyleMap = new Map();
    remappedNodes.forEach((node) => {
        const isActive = activeLineageIds.has(node.id);
        const isInactive = inactiveNodeIds.has(node.id);
        // Do not fade anything if there is no evidence found at all
        const shouldFade = normalizedSettings.fadeInactiveBranches && isInactive && !isActive && hasAnyEvidence;

        if (shouldFade) {
            nodeStyleMap.set(node.id, {
                opacity: 0.22,
                transition: 'opacity 140ms ease-in-out',
            });
        }
    });

    const nodes = remappedNodes.map((node) => {
        const style = nodeStyleMap.get(node.id);
        if (!style) return node;
        return {
            ...node,
            style,
        };
    });

    const baseEdges = layoutedEdges.map((edge) => {
        const sourceId = toId(edge.source);
        const targetId = toId(edge.target);
        const isActiveEdge = normalizedSettings.highlightActiveBranches
            && activeLineageIds.has(sourceId)
            && activeLineageIds.has(targetId);

        const shouldFadeEdge = normalizedSettings.fadeInactiveBranches
            && inactiveNodeIds.has(targetId)
            && !isActiveEdge
            && hasAnyEvidence;

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
            style.opacity = 0.16;
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
        for (let i = 0; i < visibleCompletedIds.length - 1; i += 1) {
            const source = visibleCompletedIds[i];
            const target = visibleCompletedIds[i + 1];
            journeyEdges.push({
                id: `journey-${source}-${target}-${i}`,
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

    const metrics = deriveGraphMetrics(
        rawNodes,
        visibleNodeIds,
        activeLineageIds,
        inactiveNodeIds,
        sessions,
        activities,
        activityGroups,
        programs || []
    );

    return {
        nodes,
        edges: [...baseEdges, ...journeyEdges],
        metrics
    };
};

const FlowTree = React.forwardRef(({
    treeData,
    sessions = [],
    activities = [],
    activityGroups = [],
    programs = [],
    viewSettings = DEFAULT_VIEW_SETTINGS,
    onNodeClick,
    onAddChild,
    sidebarOpen,
    selectedNodeId
}, ref) => {
    const [rfInstance, setRfInstance] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const isMobile = useIsMobile();

    const { getGoalColor } = useTheme();
    const completedGoalColor = getGoalColor('Completed');

    React.useImperativeHandle(ref, () => ({
        startFadeOut: () => {
            setIsVisible(false);
        }
    }), []);

    const { nodes: graphNodes, edges: graphEdges, metrics: graphMetrics } = useMemo(() => {
        return buildGraphPresentation({
            treeData,
            onNodeClick,
            onAddChild,
            selectedNodeId,
            completedGoalColor,
            viewSettings,
            sessions,
            activities,
            activityGroups,
            programs,
            isMobile,
        });
    }, [
        treeData,
        onNodeClick,
        onAddChild,
        selectedNodeId,
        completedGoalColor,
        viewSettings,
        sessions,
        activities,
        activityGroups,
        programs,
        isMobile,
    ]);

    const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

    useEffect(() => {
        setNodes(graphNodes);
        setEdges(graphEdges);
    }, [graphNodes, graphEdges, setNodes, setEdges]);

    useEffect(() => {
        if (rfInstance) {
            const hideTimer = setTimeout(() => setIsVisible(false), 0);
            const timer = setTimeout(() => {
                rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration: 200 });
                setTimeout(() => setIsVisible(true), 200);
            }, 100);
            return () => {
                clearTimeout(hideTimer);
                clearTimeout(timer);
            };
        }
        return undefined;
    }, [rfInstance, isMobile]);

    useEffect(() => {
        if (rfInstance && graphNodes.length > 0) {
            requestAnimationFrame(() => {
                rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration: 220 });
            });
        }
    }, [graphNodes, rfInstance, isMobile]);

    useEffect(() => {
        if (rfInstance) {
            const hideTimer = setTimeout(() => setIsVisible(false), 0);

            const timer = setTimeout(() => {
                rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration: 200 });
                setTimeout(() => setIsVisible(true), 220);
            }, 220);

            return () => {
                clearTimeout(hideTimer);
                clearTimeout(timer);
            };
        }
        return undefined;
    }, [sidebarOpen, selectedNodeId, rfInstance, isMobile]);

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
                fitViewOptions={{ padding: isMobile ? 0.08 : 0.2 }}
                attributionPosition="bottom-left"
                minZoom={isMobile ? 0.06 : 0.1}
                maxZoom={isMobile ? 1.6 : 2}
                nodesConnectable={false}
                nodesDraggable={false}
                panOnScroll={isMobile}
                zoomOnScroll={true}
                panOnDrag={isMobile ? true : [0]}
                defaultEdgeOptions={{
                    type: 'straight',
                    style: { stroke: 'var(--color-connection-line)', strokeWidth: 1.5 }
                }}
                proOptions={{ hideAttribution: true }}
            >
            </ReactFlow>

            {viewSettings.showMetricsOverlay && graphMetrics && (
                <div className={`${styles.metricsOverlay} ${sidebarOpen ? styles.metricsOverlayVertical : ''}`}>
                    <div className={styles.metricsRow}>
                        <div className={styles.metricsRowTitle}>Goals</div>
                        <div className={styles.metricItem} title="Total number of goals visible in this branch">Count: <span className={styles.metricValue}>{graphMetrics.row1.totalGoals}</span></div>
                        <div className={styles.metricItem} title="Number of goals marked as completed">Completed: <span className={styles.metricValue}>{graphMetrics.row1.completedGoals} ({graphMetrics.row1.pctCompleted}%)</span></div>
                        <div className={styles.metricItem} title="Percentage of goals that meet SMART criteria">SMART: <span className={styles.metricValue}>{graphMetrics.row1.pctSmart}%</span></div>
                    </div>

                    <div className={styles.metricsRow}>
                        <div className={styles.metricsRowTitle}>Work Evidence</div>
                        <div className={styles.metricItem} title="Number of completed sessions linked to this branch">Completed Sessions: <span className={styles.metricValue}>{graphMetrics.row2.completedSessionsCount}</span></div>
                        <div className={styles.metricItem} title="Number of unique activity definitions mapped to this branch">Associated Activities: <span className={styles.metricValue}>{graphMetrics.row2.associatedActivitiesCount}</span></div>
                        <div className={styles.metricItem} title="Number of exact activity instances completed">Completed Activity Instances: <span className={styles.metricValue}>{graphMetrics.row2.completedInstancesCount}</span></div>
                        <div className={styles.metricItem} title="Total time tracked in associated sessions">Completed Session Time: <span className={styles.metricValue}>{graphMetrics.row2.totalSessionDuration}</span></div>
                        <div className={styles.metricItem} title="Total time tracked in exact activity instances">Completed Activity Time: <span className={styles.metricValue}>{graphMetrics.row2.totalInstanceDuration}</span></div>
                    </div>

                    <div className={styles.metricsRow}>
                        <div className={styles.metricsRowTitle}>Pathways</div>
                        <div className={styles.metricItem} title="Branches that contain tracked work or sessions">Active Branches: <span className={styles.metricValue}>{graphMetrics.row3.activeVisibleNodesCount}</span></div>
                        <div className={styles.metricItem} title="Branches completely empty of direct work evidence">Inactive Branches: <span className={styles.metricValue}>{graphMetrics.row3.inactiveVisibleNodesCount}</span></div>
                    </div>

                    <div className={styles.metricsRow}>
                        <div className={styles.metricsRowTitle}>Momentum (7D)</div>
                        <div className={styles.metricItem} title="Sessions completed within the last 7 days">Sessions: <span className={styles.metricValue}>{graphMetrics.row4.recentSessionsCount}</span></div>
                        <div className={styles.metricItem} title="Activities completed within the last 7 days">Activities: <span className={styles.metricValue}>{graphMetrics.row4.recentInstancesCount}</span></div>
                        <div className={styles.metricItem} title="Total session time logged in the last 7 days">Time Spent: <span className={styles.metricValue}>{graphMetrics.row4.recentSessionDuration}</span></div>
                        <div className={styles.metricItem} title="Number of goals marked complete in the last 7 days">Goals Hit: <span className={styles.metricValue}>{graphMetrics.row4.recentCompletedGoalsCount}</span></div>
                    </div>

                    <div className={styles.metricsRow}>
                        <div className={styles.metricsRowTitle}>Program Alignment</div>
                        <div className={styles.metricItem} title="Visible goals currently scheduled in an active program">Scheduled Goals: <span className={styles.metricValue}>{graphMetrics.row5.goalsInActiveProgramCount}</span></div>
                        <div className={styles.metricItem} title="Completed sessions that belong to a program day">Program Sessions: <span className={styles.metricValue}>{graphMetrics.row5.programSessionsCount}</span></div>
                        <div className={styles.metricItem} title="Percentage of recent tracking (7D) done through active programs">Focus Efficiency: <span className={styles.metricValue}>{graphMetrics.row5.programFocusEfficiency}%</span></div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default FlowTree;
