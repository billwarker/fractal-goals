import React, { useMemo, useEffect, useState, useCallback } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    Handle,
    Position,
} from 'reactflow';

import { DEFAULT_VIEW_SETTINGS, buildGraphPresentation } from './components/flowTree/flowTreeGraphUtils';
import { ACTIVE_GOAL_WINDOW_DAYS } from './hooks/useFlowTreeMetrics';
import { useTheme } from './contexts/ThemeContext'
import { useGoalLevels } from './contexts/GoalLevelsContext';
import GoalIcon from './components/atoms/GoalIcon';
import AnimatedGoalIcon from './components/atoms/AnimatedGoalIcon';
import useIsMobile from './hooks/useIsMobile';
import './FlowTree.css';
import 'reactflow/dist/style.css';

import styles from './FlowTree.module.css';

const CustomNode = ({ data }) => {
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getCompletionColor, getGoalIcon } = useGoalLevels();;
    const { animatedIcons } = useTheme();
    const isCompleted = data.completed || false;
    const isSmartGoal = data.isSmart || false;

    const completionChar = getLevelByName('Completed') || { icon: 'check' };
    const levelChar = { icon: getGoalIcon(data.type) };
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

    const IconComponent = animatedIcons ? AnimatedGoalIcon : GoalIcon;
    const iconProps = animatedIcons
        ? { shape: config.icon, color: fillColor, secondaryColor: smartRingFillColor, isSmart: isSmartGoal, size: 30, reduced: true }
        : { shape: config.icon, color: fillColor, secondaryColor: smartRingFillColor, isSmart: isSmartGoal, size: 30 };

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
                <IconComponent
                    {...iconProps}
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

const EMPTY_ARRAY = [];

const FlowTree = React.forwardRef(({
    treeData,
    sessions = EMPTY_ARRAY,
    evidenceGoalIds = null,
    metricsSummary = null,
    activities = EMPTY_ARRAY,
    activityGroups = EMPTY_ARRAY,
    programs = EMPTY_ARRAY,
    viewSettings = DEFAULT_VIEW_SETTINGS,
    onNodeClick,
    onAddChild,
    sidebarOpen,
    selectedNodeId
}, ref) => {
    const [rfInstance, setRfInstance] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const isMobile = useIsMobile();

    const { getGoalColor } = useGoalLevels();
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
            evidenceGoalIds,
            metricsSummary,
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
        evidenceGoalIds,
        metricsSummary,
        activities,
        activityGroups,
        programs,
        isMobile,
    ]);

    const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

    const handleReactFlowInit = useCallback((instance) => {
        setRfInstance((currentInstance) => currentInstance || instance);
    }, []);

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
                onInit={handleReactFlowInit}
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
                        <div className={styles.metricItem} title="Number of goals that meet SMART criteria">SMART: <span className={styles.metricValue}>{graphMetrics.row1.smartGoals} ({graphMetrics.row1.pctSmart}%)</span></div>
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
                        <div className={styles.metricItem} title={`Branches with an associated completed activity instance in the last ${ACTIVE_GOAL_WINDOW_DAYS} days`}>Active Branches: <span className={styles.metricValue}>{graphMetrics.row3.activeVisibleNodesCount}</span></div>
                        <div className={styles.metricItem} title={`Branches without an associated completed activity instance in the last ${ACTIVE_GOAL_WINDOW_DAYS} days`}>Inactive Branches: <span className={styles.metricValue}>{graphMetrics.row3.inactiveVisibleNodesCount}</span></div>
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
