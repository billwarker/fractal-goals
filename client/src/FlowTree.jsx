import React, { useMemo, useEffect, useState, useCallback } from 'react';
import ReactFlow, {
    BaseEdge,
    useNodesState,
    useEdgesState,
    getViewportForBounds,
} from 'reactflow';

import {
    DEFAULT_VIEW_SETTINGS,
    FLOWTREE_LAYOUT_NODE_DIMENSIONS,
    buildGraphPresentation,
} from './components/flowTree/flowTreeGraphUtils';
import FlowTreeNode from './components/flowTree/FlowTreeNode';
import { ACTIVE_GOAL_WINDOW_DAYS } from './hooks/useFlowTreeMetrics';
import { useGoalLevels } from './contexts/GoalLevelsContext';
import useIsMobile from './hooks/useIsMobile';
import './FlowTree.css';
import 'reactflow/dist/style.css';
import styles from './FlowTree.module.css';

const nodeTypes = {
    custom: FlowTreeNode,
};

function TreeCenterEdge({ data, style, className }) {
    const source = data?.sourceCenter;
    const target = data?.targetCenter;
    if (!source || !target) return null;

    return (
        <BaseEdge
            path={`M ${source.x} ${source.y} L ${target.x} ${target.y}`}
            style={style}
            className={className}
        />
    );
}

const edgeTypes = {
    treeCenter: TreeCenterEdge,
};

const EMPTY_ARRAY = [];

function getGraphBounds(nodes, dimensions) {
    if (!nodes.length) return null;

    const bounds = nodes.reduce((acc, node) => {
        const width = node.width || dimensions.width;
        const height = node.height || dimensions.height;
        const minX = node.position.x;
        const minY = node.position.y;
        const maxX = node.position.x + width;
        const maxY = node.position.y + height;

        return {
            minX: Math.min(acc.minX, minX),
            minY: Math.min(acc.minY, minY),
            maxX: Math.max(acc.maxX, maxX),
            maxY: Math.max(acc.maxY, maxY),
        };
    }, {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
    });

    return {
        x: bounds.minX,
        y: bounds.minY,
        width: Math.max(bounds.maxX - bounds.minX, 1),
        height: Math.max(bounds.maxY - bounds.minY, 1),
    };
}

function getHierarchyViewport(bounds, viewportWidth, viewportHeight, isMobile, sidebarOpen = false) {
    if (!bounds || !viewportWidth || !viewportHeight) return null;

    const leftInset = sidebarOpen && !isMobile
        ? Math.min(420, viewportWidth * 0.32)
        : 0;
    const paddingX = isMobile ? 56 : 120;
    const paddingY = isMobile ? 120 : 96;
    const safeWidth = Math.max(viewportWidth - leftInset, 1);
    const safeHeight = Math.max(viewportHeight, 1);
    const zoomX = (safeWidth - paddingX) / Math.max(bounds.width, 1);
    const zoomY = (safeHeight - paddingY) / Math.max(bounds.height, 1);
    const zoom = Math.min(isMobile ? 1 : 1.08, Math.max(isMobile ? 0.22 : 0.28, Math.min(zoomX, zoomY)));
    const centerX = leftInset + (safeWidth / 2);
    const centerY = safeHeight / 2;

    return {
        x: centerX - ((bounds.x + (bounds.width / 2)) * zoom),
        y: centerY - ((bounds.y + (bounds.height / 2)) * zoom),
        zoom,
    };
}

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
    selectedNodeId,
    zoomTargetNodeId = null,
    activeGoalWindowDays = ACTIVE_GOAL_WINDOW_DAYS,
    scopeTransitionKey = 0,
    layoutMode = 'tree',
}, ref) => {
    const [rfInstance, setRfInstance] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const processedScopeTransitionKeyRef = React.useRef(scopeTransitionKey);
    const pendingScopeTransitionKeyRef = React.useRef(null);
    const scopeRevealTimerRef = React.useRef(null);
    const scopeCenterFrameRef = React.useRef(null);
    const skipNextVisibleFitViewRef = React.useRef(false);
    const flowTreeContainerRef = React.useRef(null);
    const isMobile = useIsMobile();

    const { getGoalColor } = useGoalLevels();
    const completedGoalColor = getGoalColor('Completed');

    React.useImperativeHandle(ref, () => ({
        startFadeOut: () => {
            skipNextVisibleFitViewRef.current = true;
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
            layoutMode,
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
        layoutMode,
    ]);

    const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);
    const showNoActiveGoalsMessage = Boolean(viewSettings?.hideInactiveGoals) && nodes.length === 0;
    const renderedNodeSignature = useMemo(
        () => nodes.map((node) => node.id).join('|'),
        [nodes]
    );
    const graphNodeSignature = useMemo(
        () => graphNodes.map((node) => node.id).join('|'),
        [graphNodes]
    );
    const setInitialViewport = useCallback((duration = 0) => {
        if (!rfInstance) return false;

        if (layoutMode !== 'hierarchy') {
            rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration });
            return true;
        }

        const containerRect = flowTreeContainerRef.current?.getBoundingClientRect();
        const dimensions = isMobile
            ? FLOWTREE_LAYOUT_NODE_DIMENSIONS.compact
            : FLOWTREE_LAYOUT_NODE_DIMENSIONS.regular;
        const graphBounds = getGraphBounds(nodes, dimensions);
        const viewport = getHierarchyViewport(
            graphBounds,
            containerRect?.width,
            containerRect?.height,
            isMobile,
            sidebarOpen
        );

        if (viewport) {
            rfInstance.setViewport?.(viewport, { duration });
            return true;
        }

        rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration });
        return true;
    }, [isMobile, layoutMode, nodes, rfInstance, sidebarOpen]);

    const handleReactFlowInit = useCallback((instance) => {
        setRfInstance((currentInstance) => currentInstance || instance);
    }, []);

    useEffect(() => () => {
        if (scopeRevealTimerRef.current) {
            clearTimeout(scopeRevealTimerRef.current);
        }
        if (scopeCenterFrameRef.current) {
            cancelAnimationFrame(scopeCenterFrameRef.current);
        }
    }, []);

    useEffect(() => {
        setNodes(graphNodes);
        setEdges(graphEdges);
    }, [graphNodes, graphEdges, setNodes, setEdges]);

    useEffect(() => {
        if (rfInstance) {
            const hideTimer = setTimeout(() => setIsVisible(false), 0);
            const timer = setTimeout(() => {
                setInitialViewport(200);
                setTimeout(() => setIsVisible(true), 200);
            }, 100);
            return () => {
                clearTimeout(hideTimer);
                clearTimeout(timer);
            };
        }
        return undefined;
    }, [rfInstance, setInitialViewport]);

    React.useLayoutEffect(() => {
        if (processedScopeTransitionKeyRef.current !== scopeTransitionKey) {
            pendingScopeTransitionKeyRef.current = scopeTransitionKey;
        }

        if (pendingScopeTransitionKeyRef.current !== scopeTransitionKey) return undefined;
        if (renderedNodeSignature !== graphNodeSignature) return undefined;

        skipNextVisibleFitViewRef.current = true;
        processedScopeTransitionKeyRef.current = scopeTransitionKey;
        pendingScopeTransitionKeyRef.current = null;

        if (scopeRevealTimerRef.current) {
            clearTimeout(scopeRevealTimerRef.current);
        }
        if (scopeCenterFrameRef.current) {
            cancelAnimationFrame(scopeCenterFrameRef.current);
        }

        scopeCenterFrameRef.current = requestAnimationFrame(() => {
            scopeCenterFrameRef.current = null;

            const dimensions = isMobile
                ? FLOWTREE_LAYOUT_NODE_DIMENSIONS.compact
                : FLOWTREE_LAYOUT_NODE_DIMENSIONS.regular;
            const graphBounds = getGraphBounds(nodes, dimensions);

            if (rfInstance && layoutMode === 'hierarchy') {
                setInitialViewport(0);
            } else if (rfInstance && graphBounds) {
                const containerRect = flowTreeContainerRef.current?.getBoundingClientRect();
                const viewport = getViewportForBounds(
                    graphBounds,
                    containerRect.width,
                    containerRect.height,
                    isMobile ? 0.06 : 0.1,
                    isMobile ? 1.6 : 2,
                    isMobile ? 0.08 : 0.2
                );
                rfInstance.setViewport?.(viewport, { duration: 0 });
            } else if (rfInstance && nodes.length > 0) {
                rfInstance.fitView({ padding: isMobile ? 0.08 : 0.2, duration: 0 });
            }

            scopeRevealTimerRef.current = setTimeout(() => {
                setIsVisible(true);
                scopeRevealTimerRef.current = null;
            }, 60);
        });

        return undefined;
    }, [graphNodeSignature, isMobile, layoutMode, nodes, renderedNodeSignature, rfInstance, scopeTransitionKey, setInitialViewport]);

    useEffect(() => {
        if (rfInstance && nodes.length > 0 && isVisible) {
            if (skipNextVisibleFitViewRef.current) {
                skipNextVisibleFitViewRef.current = false;
                return undefined;
            }
            const frameId = requestAnimationFrame(() => {
                setInitialViewport(220);
            });
            return () => cancelAnimationFrame(frameId);
        }
        return undefined;
    }, [nodes, rfInstance, isVisible, setInitialViewport]);

    useEffect(() => {
        if (rfInstance) {
            const hideTimer = setTimeout(() => setIsVisible(false), 0);

            const timer = setTimeout(() => {
                setInitialViewport(200);
                setTimeout(() => setIsVisible(true), 220);
            }, 220);

            return () => {
                clearTimeout(hideTimer);
                clearTimeout(timer);
            };
        }
        return undefined;
    }, [sidebarOpen, selectedNodeId, rfInstance, setInitialViewport]);

    useEffect(() => {
        if (!rfInstance || !zoomTargetNodeId || nodes.length === 0) return;

        const targetNode = nodes.find((node) => node.id === String(zoomTargetNodeId));
        if (!targetNode) return;

        const dimensions = isMobile
            ? FLOWTREE_LAYOUT_NODE_DIMENSIONS.compact
            : FLOWTREE_LAYOUT_NODE_DIMENSIONS.regular;
        const centerX = targetNode.position.x + ((targetNode.width || dimensions.width) / 2);
        const centerY = targetNode.position.y + ((targetNode.height || dimensions.height) / 2);

        requestAnimationFrame(() => {
            rfInstance.setCenter(centerX, centerY, {
                zoom: isMobile ? 0.9 : 1.1,
                duration: 260,
            });
            setIsVisible(true);
        });
    }, [isMobile, nodes, rfInstance, zoomTargetNodeId]);

    return (
        <div
            ref={flowTreeContainerRef}
            className={styles.flowTreeContainer}
            style={{ opacity: isVisible ? 1 : 0 }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
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
                panOnDrag={layoutMode === 'hierarchy' ? true : (isMobile ? true : [0])}
                defaultEdgeOptions={{
                    type: 'straight',
                    style: { stroke: 'var(--color-connection-line)', strokeWidth: 1.5 }
                }}
                proOptions={{ hideAttribution: true }}
            >
            </ReactFlow>

            {showNoActiveGoalsMessage && (
                <div className={styles.emptyState} role="status">
                    No active goals exist
                </div>
            )}

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
                        <div className={styles.metricItem} title={`Root-to-leaf branches whose lineage has a completed activity instance in the last ${activeGoalWindowDays} days`}>Active Branches: <span className={styles.metricValue}>{graphMetrics.row3.activeBranchesCount}</span></div>
                        <div className={styles.metricItem} title={`Root-to-leaf branches without any completed activity instance in the last ${activeGoalWindowDays} days`}>Inactive Branches: <span className={styles.metricValue}>{graphMetrics.row3.inactiveBranchesCount}</span></div>
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
