import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalDetailModal from '../components/GoalDetailModal';
import AlertModal from '../components/modals/AlertModal';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import { useDebug } from '../contexts/DebugContext';
import { getChildType } from '../utils/goalHelpers';
import { calculateMetrics } from '../utils/metricsHelpers';
import useIsMobile from '../hooks/useIsMobile';
import '../App.css';
import './FractalGoals.css';

/**
 * FractalGoals Page - FlowTree visualization with sidebar
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree.
 * They are managed separately via the /sessions page.
 */
function FractalGoals() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    // Contexts
    const {
        useFractalTreeQuery,
        createGoal,
        updateGoal,
        deleteGoal,
        toggleGoalCompletion,
        setActiveRootId
    } = useGoals();

    // 1. Data Query (TanStack Query)
    const {
        data: fractalData,
        isLoading: goalsLoading
    } = useFractalTreeQuery(rootId);

    const {
        fetchSessions,
        useSessionsQuery
    } = useSessions();

    const {
        data: sessions = [],
        isLoading: sessionsLoading
    } = useSessionsQuery(rootId);

    const {
        activities,
        activityGroups,
        fetchActivities,
        fetchActivityGroups
    } = useActivities();

    const { debugMode } = useDebug();
    const isMobile = useIsMobile();

    // Programs State
    const [programs, setPrograms] = useState([]);
    const [programsLoading, setProgramsLoading] = useState(false);

    const fetchPrograms = async (id) => {
        try {
            setProgramsLoading(true);
            const { fractalApi } = await import('../utils/api');
            const res = await fractalApi.getPrograms(id);
            setPrograms(res.data || []);
        } catch (err) {
            console.error("Failed to fetch programs:", err);
        } finally {
            setProgramsLoading(false);
        }
    };

    const loading = goalsLoading;

    // Calculate metrics for the overlay (must be before any conditional returns)
    const metrics = useMemo(() => {
        return fractalData ? calculateMetrics(fractalData) : null;
    }, [fractalData]);

    // Sidebar state
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);

    // Modal state
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    // Alert state
    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });

    // Initial Data Fetch (Only for non-Query managed data)
    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        setActiveRootId(rootId);
        fetchSessions(rootId);
        fetchActivities(rootId);
        fetchActivityGroups(rootId);
        fetchPrograms(rootId);

        return () => setActiveRootId(null);
    }, [rootId, navigate, setActiveRootId]);

    // Sync viewingGoal with fractalData updates (e.g. when completion status changes)
    useEffect(() => {
        if (!fractalData || !viewingGoal) return;

        // Recursive helper to find goal in tree
        const findGoal = (node, targetId) => {
            const nodeId = node.attributes?.id || node.id;
            if (nodeId === targetId) return node;

            if (node.children) {
                for (const child of node.children) {
                    const found = findGoal(child, targetId);
                    if (found) return found;
                }
            }
            return null;
        };

        const viewingId = viewingGoal.attributes?.id || viewingGoal.id;
        const updatedGoal = findGoal(fractalData, viewingId);

        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

    // Helper to show alert
    const showAlert = (title, message) => {
        setAlertData({ isOpen: true, title, message });
    };

    // Handlers

    const handleGoalNameClick = (nodeDatum) => {
        setViewingGoal(nodeDatum);
        setSidebarMode('goal-details');
    };

    const handleAddChildClick = (nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);

        if (!childType) {
            showAlert('Notice', 'This goal type cannot have children.');
            return;
        }

        // Show the Goal creation modal
        setSelectedParent(nodeDatum);
        setShowGoalModal(true);
    };

    const handleCreateGoal = async (goalData) => {
        try {
            await createGoal(rootId, goalData);
            setShowGoalModal(false);
        } catch (err) {
            showAlert('Creation Failed', 'Error creating goal: ' + err.message);
        }
    };

    const handleUpdateNode = async (payload) => {
        try {
            const nodeId = viewingGoal.id || viewingGoal.attributes?.id;
            const updated = await updateGoal(rootId, String(nodeId), payload);
            setViewingGoal(updated);
        } catch (err) {
            showAlert('Update Failed', 'Failed to update: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            await toggleGoalCompletion(rootId, goalId, !currentStatus);
        } catch (err) {
            showAlert('Update Failed', 'Error updating completion: ' + err.message);
        }
    };

    const handleDelete = async () => {
        if (!fractalToDelete) return;

        try {
            await deleteGoal(rootId, fractalToDelete.id);

            setFractalToDelete(null);
            setSidebarMode(null);
            setViewingGoal(null);
        } catch (err) {
            showAlert('Deletion Failed', 'Failed to delete: ' + err.message);
        }
    };


    if (loading || !fractalData) {
        return (
            <div className="loading-container">
                <p className="loading-text">Loading fractal data...</p>
            </div>
        );
    }

    const sidebarWidth = isMobile ? '100%' : '32.5vw';
    const minSidebarWidth = isMobile ? '0' : '390px';
    const navSpacerHeight = isMobile ? '76px' : '60px';
    const isSidebarOpen = showGoalModal || !!sidebarMode;

    return (
        <div className="fractal-page-container" style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Nav Padding Spacer */}
            <div style={{ height: navSpacerHeight, flexShrink: 0 }} />

            <div className="fractal-main-layout" style={{
                display: 'flex',
                flex: 1,
                width: '100%',
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Main Content - FlowTree (Debug border visible when Ctrl+Shift+D) */}
                <div
                    className="fractal-view-wrapper"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        border: debugMode ? '4px solid red' : 'none',
                        boxSizing: 'border-box',
                        position: 'relative'
                    }}
                >
                    {/* Metrics Overlay - Top Left of Viewport */}
                    {metrics && (
                        <div style={{
                            position: 'absolute',
                            top: isMobile ? '8px' : '12px',
                            left: isMobile ? '8px' : '16px',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: isMobile ? '4px' : '6px',
                            pointerEvents: 'none'
                        }}>
                            <div className="metric-item">
                                {metrics.totalGoals} goals (<span className="metric-completed">{metrics.goalCompletionPercentage}% completed</span>)
                            </div>
                            <div className="metric-item">
                                {metrics.totalDeadlines} deadlines (<span className="metric-missed">{metrics.deadlineMissedPercentage}% missed</span>)
                            </div>
                            <div className="metric-item">
                                {metrics.totalTargets} targets (<span className="metric-completed">{metrics.targetCompletionPercentage}% completed</span>)
                            </div>
                        </div>
                    )}

                    <FractalView
                        treeData={fractalData}
                        onNodeClick={handleGoalNameClick}
                        selectedNodeId={viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null}
                        onAddChild={handleAddChildClick}
                        sidebarOpen={isSidebarOpen}
                        key={rootId}
                    />
                </div>

                {/* Side Panel (View or Create) */}
                {isSidebarOpen && (
                    <div className="details-window sidebar docked" style={{
                        width: sidebarWidth,
                        minWidth: minSidebarWidth,
                        height: isMobile ? '100%' : 'calc(100% - 40px)',
                        position: isMobile ? 'absolute' : 'relative',
                        top: isMobile ? 0 : 'auto',
                        right: isMobile ? 0 : 'auto',
                        bottom: isMobile ? 0 : 'auto',
                        left: isMobile ? 0 : 'auto',
                        margin: isMobile ? 0 : '20px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-sidebar)',
                        zIndex: isMobile ? 1200 : 10,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: isMobile ? 0 : '12px',
                        boxShadow: 'var(--shadow-md)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div className="window-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            {showGoalModal ? (
                                <GoalDetailModal
                                    isOpen={true}
                                    onClose={() => setShowGoalModal(false)}
                                    mode="create"
                                    onCreate={handleCreateGoal}
                                    parentGoal={selectedParent}
                                    activityDefinitions={activities}
                                    activityGroups={activityGroups}
                                    rootId={rootId}
                                    displayMode="panel"
                                />
                            ) : (
                                <ErrorBoundary>
                                    <Sidebar
                                        selectedNode={viewingGoal}
                                        selectedRootId={rootId}
                                        onClose={() => {
                                            setSidebarMode(null);
                                            setViewingGoal(null);
                                        }}
                                        onUpdate={handleUpdateNode}
                                        onDelete={(node) => setFractalToDelete(node)}
                                        onAddChild={handleAddChildClick}
                                        onAddSession={() => {
                                            const goalId = viewingGoal?.id || viewingGoal?.attributes?.id;
                                            navigate(`/${rootId}/create-session?goalId=${goalId}`);
                                        }}
                                        onToggleCompletion={handleToggleCompletion}
                                        treeData={fractalData}
                                        sessions={sessions}
                                        activityDefinitions={activities}
                                        activityGroups={activityGroups}
                                        programs={programs}
                                        onGoalSelect={handleGoalNameClick}
                                    />
                                </ErrorBoundary>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals (Delete/Alert only) */}
            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Goal?"
                message={`Are you sure you want to delete "${fractalToDelete?.name}" and all its children?`}
                requireMatchingText="delete"
            />

            <AlertModal
                isOpen={alertData.isOpen}
                onClose={() => setAlertData({ ...alertData, isOpen: false })}
                title={alertData.title}
                message={alertData.message}
            />
        </div>
    );
}

export default FractalGoals;
