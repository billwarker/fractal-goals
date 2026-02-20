import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalDetailModal from '../components/GoalDetailModal';
import AlertModal from '../components/modals/AlertModal';
import Checkbox from '../components/atoms/Checkbox';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import { useDebug } from '../contexts/DebugContext';
import { useTheme } from '../contexts/ThemeContext';
import { getChildType } from '../utils/goalHelpers';
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
    const FLOWTREE_SETTINGS_STORAGE_KEY = 'flowtree-view-settings';

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
        useAllSessionsQuery
    } = useSessions();

    const {
        data: sessions = [],
    } = useAllSessionsQuery(rootId);

    const {
        activities,
        activityGroups,
        fetchActivities,
        fetchActivityGroups
    } = useActivities();

    const { debugMode } = useDebug();
    const { getGoalColor } = useTheme();
    const isMobile = useIsMobile();

    // Programs State
    const [programs, setPrograms] = useState([]);

    const fetchPrograms = useCallback(async (id) => {
        try {
            const { fractalApi } = await import('../utils/api');
            const res = await fractalApi.getPrograms(id);
            setPrograms(res.data || []);
        } catch (err) {
            console.error("Failed to fetch programs:", err);
        }
    }, []);

    const loading = goalsLoading;

    // Sidebar state
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);
    const [isMobilePanelCollapsed, setIsMobilePanelCollapsed] = useState(true);

    // Modal state
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    // Alert state
    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });
    const DEFAULT_VIEW_SETTINGS = {
        highlightActiveBranches: false,
        fadeInactiveBranches: false,
        showCompletionJourney: false,
        showMetricsOverlay: false,
    };
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);

    // Initial Data Fetch (Only for non-Query managed data)
    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        setActiveRootId(rootId);
        fetchActivities(rootId);
        fetchActivityGroups(rootId);
        fetchPrograms(rootId);

        return () => setActiveRootId(null);
    }, [rootId, navigate, setActiveRootId, fetchActivities, fetchActivityGroups, fetchPrograms]);

    useEffect(() => {
        if (!rootId) return;
        try {
            const raw = localStorage.getItem(`${FLOWTREE_SETTINGS_STORAGE_KEY}:${rootId}`);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            setViewSettings((prev) => ({
                ...prev,
                ...parsed
            }));
        } catch (err) {
            console.error('Failed to load FlowTree settings:', err);
        }
    }, [rootId]);

    useEffect(() => {
        if (!rootId) return;
        try {
            localStorage.setItem(`${FLOWTREE_SETTINGS_STORAGE_KEY}:${rootId}`, JSON.stringify(viewSettings));
        } catch (err) {
            console.error('Failed to persist FlowTree settings:', err);
        }
    }, [rootId, viewSettings]);

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
        if (isMobile) setIsMobilePanelCollapsed(false);
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
        if (isMobile) setIsMobilePanelCollapsed(false);
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
    const sheetTitle = showGoalModal
        ? 'Create Goal'
        : (viewingGoal?.name || viewingGoal?.attributes?.name || 'Goal Details');
    const activeGoalType = showGoalModal
        ? getChildType(selectedParent?.attributes?.type || selectedParent?.type)
        : (viewingGoal?.attributes?.type || viewingGoal?.type);
    const sheetTitleColor = activeGoalType ? getGoalColor(activeGoalType) : 'var(--color-text-primary)';
    const handleToggleViewSetting = (settingKey) => (event) => {
        setViewSettings((prev) => ({
            ...prev,
            [settingKey]: event.target.checked
        }));
    };

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
                    <div className={`flowtree-options-pane ${isMobile ? 'flowtree-options-pane-mobile' : ''}`}>
                        <div className="flowtree-options-title">Graph View</div>
                        <Checkbox
                            label="Highlight active branches"
                            checked={viewSettings.highlightActiveBranches}
                            onChange={handleToggleViewSetting('highlightActiveBranches')}
                        />
                        <Checkbox
                            label="Fade inactive branches"
                            checked={viewSettings.fadeInactiveBranches}
                            onChange={handleToggleViewSetting('fadeInactiveBranches')}
                        />
                        <Checkbox
                            label="Show completion journey"
                            checked={viewSettings.showCompletionJourney}
                            onChange={handleToggleViewSetting('showCompletionJourney')}
                        />
                        <Checkbox
                            label="Show metrics overlay"
                            checked={viewSettings.showMetricsOverlay}
                            onChange={handleToggleViewSetting('showMetricsOverlay')}
                        />
                    </div>
                    <FractalView
                        treeData={fractalData}
                        sessions={sessions}
                        activities={activities}
                        activityGroups={activityGroups}
                        programs={programs}
                        viewSettings={viewSettings}
                        onNodeClick={handleGoalNameClick}
                        selectedNodeId={viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null}
                        onAddChild={handleAddChildClick}
                        sidebarOpen={isSidebarOpen && !(isMobile && isMobilePanelCollapsed)}
                        key={rootId}
                    />
                </div>

                {/* Side Panel (View or Create) */}
                {isSidebarOpen && (
                    <div className="details-window sidebar docked" style={{
                        width: sidebarWidth,
                        minWidth: minSidebarWidth,
                        height: isMobile ? (isMobilePanelCollapsed ? '112px' : '70vh') : 'calc(100% - 40px)',
                        position: isMobile ? 'absolute' : 'relative',
                        top: isMobile ? 'auto' : 'auto',
                        right: isMobile ? 0 : 'auto',
                        bottom: isMobile ? 0 : 'auto',
                        left: isMobile ? 0 : 'auto',
                        margin: isMobile ? 0 : '20px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-sidebar)',
                        zIndex: isMobile ? 1200 : 10,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: isMobile ? '12px 12px 0 0' : '12px',
                        boxShadow: 'var(--shadow-md)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        {isMobile && isMobilePanelCollapsed && (
                            <button
                                type="button"
                                className="mobile-sheet-collapsed-bar"
                                onClick={() => setIsMobilePanelCollapsed(false)}
                                style={{ '--collapsed-goal-color': sheetTitleColor }}
                            >
                                <span className="mobile-sheet-collapsed-chevron">▲</span>
                                <span className="mobile-sheet-collapsed-title">{sheetTitle}</span>
                            </button>
                        )}

                        {(!isMobile || !isMobilePanelCollapsed) && (
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
                                        onMobileCollapse={isMobile ? () => setIsMobilePanelCollapsed(true) : undefined}
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
                                            onMobileCollapse={isMobile ? () => setIsMobilePanelCollapsed(true) : undefined}
                                        />
                                    </ErrorBoundary>
                                )}
                            </div>
                        )}
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
