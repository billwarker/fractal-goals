import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AlertModal from '../components/modals/AlertModal';
import Checkbox from '../components/atoms/Checkbox';
import { useGoals } from '../contexts/GoalsContext';
import { useDebug } from '../contexts/DebugContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { buildTreeMaps, getLineagePath } from '../components/flowTree/flowTreeTreeUtils';
import { useActivities as useActivitiesQuery, useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import { getActiveGoalWindowDaysFromSettings } from '../hooks/useFlowTreeMetrics';
import { useFlowTreeEvidence, useFlowtreeSessionMetrics } from '../hooks/useSessionQueries';
import { getChildType } from '../utils/goalHelpers';
import { findGoalNodeById, getGoalNodeId, getGoalNodeName, getGoalNodeType } from '../utils/goalNodeModel';
import { getGoalSearchMatches, getVisibleGoalSearchCandidates } from '../utils/goalTypeToZoomSearch';
import { usePrograms } from '../hooks/useProgramQueries';
import useIsMobile from '../hooks/useIsMobile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import '../App.css';
import './FractalGoals.css';

const GoalDetailModal = lazyWithRetry(() => import('../components/ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

/**
 * FractalGoals Page - FlowTree visualization with sidebar
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree.
 * They are managed separately via the /sessions page.
 */
const FLOWTREE_SETTINGS_STORAGE_KEY = 'flowtree-view-settings';
const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
};
const EMPTY_ARRAY = [];
const TYPE_TO_ZOOM_IDLE_MS = 2000;

function shouldIgnoreTypeToZoomKey(event) {
    const target = event.target;
    const activeElement = document.activeElement;
    const element = target instanceof Element ? target : activeElement;

    if (!element) return false;
    if (element.closest('[role="dialog"], [aria-modal="true"]')) return true;
    if (element.isContentEditable) return true;

    const tagName = element.tagName?.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tagName);
}

function isSearchCharacter(key) {
    return typeof key === 'string' && key.length === 1 && /^[a-z0-9]$/i.test(key);
}

function getQueryCharacter(event) {
    if (event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space') {
        return ' ';
    }
    return typeof event.key === 'string' && event.key.length === 1 ? event.key : null;
}

function renderTypeToZoomQuery(query) {
    return String(query).replace(/ /g, '\u00a0');
}

function FractalGoals() {
    const hideCompletedTooltip = 'Hides completed goals from the fractal tree.';
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(false);

    const { rootId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Contexts
    const {
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
    } = useFractalTree(rootId);
    const activeGoalWindowDays = getActiveGoalWindowDaysFromSettings(
        fractalData?.attributes?.progress_settings
    );
    const inactiveBranchTooltip = `Dims branches with no associated completed activity instances in the last ${activeGoalWindowDays} days.`;
    const { data: evidenceData, isLoading: evidenceLoading } = useFlowTreeEvidence(rootId, activeGoalWindowDays);

    const { activities = EMPTY_ARRAY, isLoading: activitiesLoading } = useActivitiesQuery(rootId);
    const { activityGroups = EMPTY_ARRAY, isLoading: activityGroupsLoading } = useActivityGroups(rootId);

    const { debugMode } = useDebug();
    const { getGoalColor } = useGoalLevels();
    const isMobile = useIsMobile();

    const { programs = EMPTY_ARRAY } = usePrograms(rootId);

    const loading = goalsLoading || activitiesLoading || activityGroupsLoading || evidenceLoading;

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
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);
    const [typeToZoomQuery, setTypeToZoomQuery] = useState('');
    const [isTypeToZoomOpen, setIsTypeToZoomOpen] = useState(false);
    const [duplicateCycleIndex, setDuplicateCycleIndex] = useState(0);
    const [cycleZoomTargetNodeId, setCycleZoomTargetNodeId] = useState(null);
    const typeToZoomIdleTimerRef = useRef(null);
    const selectedNodeId = viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null;
    const evidenceGoalIds = useMemo(() => {
        if (!evidenceData) return null;
        return new Set((evidenceData.goal_ids || []).map((goalId) => String(goalId)));
    }, [evidenceData]);
    const visibleGoalIds = useMemo(() => {
        if (!fractalData) return [];
        if (selectedNodeId) {
            return Array.from(getLineagePath(fractalData, selectedNodeId));
        }
        return Array.from(buildTreeMaps(fractalData).nodeById.keys());
    }, [fractalData, selectedNodeId]);
    const { data: flowtreeMetricsSummary } = useFlowtreeSessionMetrics(
        rootId,
        visibleGoalIds,
        { enabled: viewSettings.showMetricsOverlay, days: activeGoalWindowDays }
    );
    const typeToZoomCandidates = useMemo(() => (
        getVisibleGoalSearchCandidates(fractalData, {
            selectedNodeId,
            hideCompletedGoals: viewSettings.hideCompletedGoals,
        })
    ), [fractalData, selectedNodeId, viewSettings.hideCompletedGoals]);
    const typeToZoomResults = useMemo(() => (
        getGoalSearchMatches(typeToZoomCandidates, typeToZoomQuery)
    ), [typeToZoomCandidates, typeToZoomQuery]);
    const activeDuplicateGroup = typeToZoomResults.activeDuplicateGroup;
    const activeDuplicateCount = activeDuplicateGroup?.length || 0;
    const visibleMatchCount = typeToZoomResults.matches.length;
    const cycleZoomTargetIsCurrent = Boolean(
        cycleZoomTargetNodeId && activeDuplicateGroup?.some((match) => match.id === cycleZoomTargetNodeId)
    );
    const effectiveZoomTargetNodeId = isTypeToZoomOpen && typeToZoomQuery && visibleMatchCount === 1
        ? typeToZoomResults.matches[0].id
        : (cycleZoomTargetIsCurrent ? cycleZoomTargetNodeId : null);
    const duplicateCycleDisplay = activeDuplicateCount > 1
        ? `${(duplicateCycleIndex % activeDuplicateCount) + 1}/${activeDuplicateCount}`
        : null;

    const clearTypeToZoomSearch = useCallback(() => {
        setTypeToZoomQuery('');
        setIsTypeToZoomOpen(false);
        setDuplicateCycleIndex(0);
        setCycleZoomTargetNodeId(null);
    }, []);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        setActiveRootId(rootId);
        localStorage.setItem('fractal_recent_root_id', rootId);

        return () => setActiveRootId(null);
    }, [rootId, navigate, setActiveRootId]);

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

    useEffect(() => {
        if (!isTypeToZoomOpen || !typeToZoomQuery) return undefined;

        if (typeToZoomIdleTimerRef.current) {
            clearTimeout(typeToZoomIdleTimerRef.current);
        }

        typeToZoomIdleTimerRef.current = setTimeout(() => {
            clearTypeToZoomSearch();
        }, TYPE_TO_ZOOM_IDLE_MS);

        return () => {
            if (typeToZoomIdleTimerRef.current) {
                clearTimeout(typeToZoomIdleTimerRef.current);
                typeToZoomIdleTimerRef.current = null;
            }
        };
    }, [clearTypeToZoomSearch, isTypeToZoomOpen, typeToZoomQuery]);

    useEffect(() => {
        if (!isTypeToZoomOpen) return undefined;

        const handleTypeToZoomKeyDown = (event) => {
            if (event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (showGoalModal || fractalToDelete || alertData.isOpen) return;
            if (shouldIgnoreTypeToZoomKey(event)) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                clearTypeToZoomSearch();
                return;
            }

            if (event.key === 'Backspace') {
                event.preventDefault();
                setTypeToZoomQuery((current) => current.slice(0, -1));
                setIsTypeToZoomOpen((current) => current && typeToZoomQuery.length > 1);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                return;
            }

            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && activeDuplicateCount > 1) {
                event.preventDefault();
                setDuplicateCycleIndex((current) => {
                    const direction = event.key === 'ArrowDown' ? 1 : -1;
                    const nextIndex = (current + direction + activeDuplicateCount) % activeDuplicateCount;
                    const nextTarget = activeDuplicateGroup[nextIndex];
                    if (nextTarget) setCycleZoomTargetNodeId(nextTarget.id);
                    return nextIndex;
                });
                return;
            }

            const queryCharacter = getQueryCharacter(event);
            if (queryCharacter) {
                event.preventDefault();
                setIsTypeToZoomOpen(true);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                setTypeToZoomQuery((current) => `${current}${queryCharacter}`);
            }
        };

        window.addEventListener('keydown', handleTypeToZoomKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomKeyDown, true);
    }, [
        activeDuplicateCount,
        activeDuplicateGroup,
        alertData.isOpen,
        clearTypeToZoomSearch,
        fractalToDelete,
        isTypeToZoomOpen,
        showGoalModal,
        typeToZoomQuery.length,
    ]);

    useEffect(() => {
        const handleTypeToZoomStartKeyDown = (event) => {
            if (isTypeToZoomOpen) return;
            if (event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (showGoalModal || fractalToDelete || alertData.isOpen) return;
            if (shouldIgnoreTypeToZoomKey(event)) return;
            if (!isSearchCharacter(event.key)) return;

            event.preventDefault();
            setIsTypeToZoomOpen(true);
            setDuplicateCycleIndex(0);
            setCycleZoomTargetNodeId(null);
            setTypeToZoomQuery(event.key);
        };

        window.addEventListener('keydown', handleTypeToZoomStartKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomStartKeyDown, true);
    }, [alertData.isOpen, fractalToDelete, isTypeToZoomOpen, showGoalModal]);

    // Sync viewingGoal with fractalData updates (e.g. when completion status changes)
    useEffect(() => {
        if (!fractalData || !viewingGoal) return;
        const viewingId = getGoalNodeId(viewingGoal);
        const updatedGoal = findGoalNodeById(fractalData, viewingId);

        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

    // Helper to show alert
    const showAlert = useCallback((title, message) => {
        setAlertData({ isOpen: true, title, message });
    }, []);

    // Handlers

    const handleGoalNameClick = useCallback((nodeDatum) => {
        setViewingGoal(nodeDatum);
        setSidebarMode('goal-details');
        if (isMobile) setIsMobilePanelCollapsed(false);
    }, [isMobile]);

    const handleAddChildClick = useCallback((nodeDatum) => {
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
    }, [isMobile, showAlert]);

    const handleCreateGoal = async (goalData) => {
        try {
            const newGoal = await createGoal(rootId, goalData);
            setShowGoalModal(false);
            return newGoal;
        } catch (err) {
            showAlert('Creation Failed', 'Error creating goal: ' + err.message);
            return null;
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

    if (rootId && location.pathname !== `/${rootId}/goals`) {
        return null;
    }

    if (loading || !fractalData) {
        return (
            <div className="loading-container">
                <p className="loading-text">Loading fractal data...</p>
            </div>
        );
    }

    const sidebarWidth = isMobile ? '100%' : 'min(700px, 32.5vw)';
    const minSidebarWidth = isMobile ? '0' : '390px';
    const isSidebarOpen = showGoalModal || !!sidebarMode;
    const sheetTitle = showGoalModal
        ? 'Create Goal'
        : (getGoalNodeName(viewingGoal) || 'Goal Details');
    const activeGoalType = showGoalModal
        ? getChildType(getGoalNodeType(selectedParent))
        : getGoalNodeType(viewingGoal);
    const sheetTitleColor = activeGoalType ? getGoalColor(activeGoalType) : 'var(--color-text-primary)';
    const handleToggleViewSetting = (settingKey) => (event) => {
        setViewSettings((prev) => ({
            ...prev,
            [settingKey]: event.target.checked
        }));
    };

    return (
        <div className="fractal-page-container" style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
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
                    <div className={`flowtree-options-pane ${isMobile ? 'flowtree-options-pane-mobile' : ''} ${isOptionsPaneMinimized ? 'flowtree-options-pane-minimized' : ''}`}>
                        <div className="flowtree-options-header">
                            <div className="flowtree-options-title">Graph View</div>
                            <button
                                type="button"
                                className="flowtree-options-minimize-btn"
                                onClick={() => setIsOptionsPaneMinimized((prev) => !prev)}
                                aria-label={isOptionsPaneMinimized ? 'Expand graph view options' : 'Minimize graph view options'}
                                title={isOptionsPaneMinimized ? 'Expand' : 'Minimize'}
                            >
                                {isOptionsPaneMinimized ? '+' : '–'}
                            </button>
                        </div>
                        {!isOptionsPaneMinimized && (
                            <>
                                <Checkbox
                                    label={<span title={inactiveBranchTooltip}>Fade inactive branches</span>}
                                    checked={viewSettings.fadeInactiveBranches}
                                    onChange={handleToggleViewSetting('fadeInactiveBranches')}
                                />
                                <Checkbox
                                    label={<span title={hideCompletedTooltip}>Hide completed goals</span>}
                                    checked={viewSettings.hideCompletedGoals}
                                    onChange={handleToggleViewSetting('hideCompletedGoals')}
                                />
                                <Checkbox
                                    label="Show metrics overlay"
                                    checked={viewSettings.showMetricsOverlay}
                                    onChange={handleToggleViewSetting('showMetricsOverlay')}
                                />
                            </>
                        )}
                    </div>
                    {isTypeToZoomOpen && typeToZoomQuery && (
                        <div className="type-to-zoom-palette" role="status" aria-live="polite">
                            <div className="type-to-zoom-label">Find goal</div>
                            <div className="type-to-zoom-query">{renderTypeToZoomQuery(typeToZoomQuery)}</div>
                            <div className="type-to-zoom-meta">
                                {visibleMatchCount === 1
                                    ? '1 match'
                                    : `${visibleMatchCount} matches`}
                                {duplicateCycleDisplay && (
                                    <span className="type-to-zoom-duplicate">Duplicate {duplicateCycleDisplay}</span>
                                )}
                            </div>
                        </div>
                    )}
                    <FractalView
                        treeData={fractalData}
                        evidenceGoalIds={evidenceGoalIds}
                        metricsSummary={flowtreeMetricsSummary}
                        activeGoalWindowDays={activeGoalWindowDays}
                        activities={activities}
                        activityGroups={activityGroups}
                        programs={programs}
                        viewSettings={viewSettings}
                        onNodeClick={handleGoalNameClick}
                        selectedNodeId={selectedNodeId}
                        zoomTargetNodeId={effectiveZoomTargetNodeId}
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
                                    <Suspense fallback={<div style={{ padding: '20px' }}>Loading Goal Details...</div>}>
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
                                            onGoalSelect={(goal) => {
                                                setShowGoalModal(false);
                                                handleGoalNameClick(goal);
                                            }}
                                        />
                                    </Suspense>
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
                                            evidenceGoalIds={evidenceGoalIds}
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
