import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AlertModal from '../components/modals/AlertModal';
import FlowTreeOptionsPane from '../components/flowTree/FlowTreeOptionsPane';
import { useGoals } from '../contexts/GoalsContext';
import { useDebug } from '../contexts/DebugContext';
import { buildTreeMaps, getLineagePath } from '../components/flowTree/flowTreeTreeUtils';
import { useActivities as useActivitiesQuery, useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import { getActiveGoalWindowDaysFromSettings, getInactiveNodeIds } from '../hooks/useFlowTreeMetrics';
import { useFlowTreeEvidence, useFlowtreeSessionMetrics } from '../hooks/useSessionQueries';
import { getChildType } from '../utils/goalHelpers';
import { findGoalNodeById, getGoalNodeId } from '../utils/goalNodeModel';
import { getGoalSearchMatches, getVisibleGoalSearchCandidates } from '../utils/goalTypeToZoomSearch';
import {
    getQueryCharacter,
    isSearchCharacter,
    renderTypeToZoomQuery,
    shouldIgnoreTypeToZoomKey,
} from '../utils/typeToZoomInput';
import { usePrograms } from '../hooks/useProgramQueries';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import '../App.css';
import './FractalGoals.css';
const GoalDetailModal = lazyWithRetry(() => import('../components/ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');
const FLOWTREE_SETTINGS_STORAGE_KEY = 'flowtree-view-settings';
const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
};
const EMPTY_ARRAY = [];
const TYPE_TO_ZOOM_IDLE_MS = 2000;
const TYPE_TO_ZOOM_LOCKED_IDLE_MS = 10000;
const FLOWTREE_SCOPE_TRANSITION_MS = 160;

function FractalGoals() {
    const hideCompletedTooltip = 'Hides completed goals from the fractal tree.';
    const hideInactiveTooltip = 'Hides goals with no completed activity evidence in the active window.';
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(false);
    const { rootId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        createGoal,
        updateGoal,
        deleteGoal,
        toggleGoalCompletion,
        setActiveRootId
    } = useGoals();
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
    const isMobile = useIsMobile();
    const [goalsViewMode, setGoalsViewMode] = useState(() => (getIsMobileViewport() ? 'hierarchy' : 'tree'));
    const { programs = EMPTY_ARRAY } = usePrograms(rootId);
    const loading = goalsLoading || activitiesLoading || activityGroupsLoading || evidenceLoading;
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);

    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);
    const [flowTreeScopeTransitionKey, setFlowTreeScopeTransitionKey] = useState(0);
    const [typeToZoomQuery, setTypeToZoomQuery] = useState('');
    const [isTypeToZoomOpen, setIsTypeToZoomOpen] = useState(false);
    const [isTypeToZoomLocked, setIsTypeToZoomLocked] = useState(false);
    const [duplicateCycleIndex, setDuplicateCycleIndex] = useState(0);
    const [cycleZoomTargetNodeId, setCycleZoomTargetNodeId] = useState(null);
    const typeToZoomIdleTimerRef = useRef(null);
    const flowTreeRef = useRef(null);
    const flowTreeScopeTransitionTimerRef = useRef(null);
    const selectedNodeId = viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null;
    const evidenceGoalIds = useMemo(() => {
        if (!evidenceData) return null;
        return new Set((evidenceData.goal_ids || []).map((goalId) => String(goalId)));
    }, [evidenceData]);
    const flowtreeMaps = useMemo(() => buildTreeMaps(fractalData), [fractalData]);
    const hiddenInactiveGoalIds = useMemo(() => {
        if (!viewSettings.hideInactiveGoals) return null;
        return getInactiveNodeIds(
            flowtreeMaps.nodeById,
            flowtreeMaps.childrenById,
            evidenceGoalIds || new Set()
        );
    }, [evidenceGoalIds, flowtreeMaps, viewSettings.hideInactiveGoals]);
    const visibleGoalIds = useMemo(() => {
        if (!fractalData) return [];
        const filterHiddenInactive = (ids) => (
            hiddenInactiveGoalIds ? ids.filter((id) => !hiddenInactiveGoalIds.has(id)) : ids
        );
        if (selectedNodeId) {
            return filterHiddenInactive(Array.from(getLineagePath(fractalData, selectedNodeId)));
        }
        return filterHiddenInactive(Array.from(flowtreeMaps.nodeById.keys()));
    }, [flowtreeMaps, fractalData, hiddenInactiveGoalIds, selectedNodeId]);
    const { data: flowtreeMetricsSummary } = useFlowtreeSessionMetrics(
        rootId,
        visibleGoalIds,
        { enabled: viewSettings.showMetricsOverlay, days: activeGoalWindowDays }
    );
    const typeToZoomCandidates = useMemo(() => (
        getVisibleGoalSearchCandidates(fractalData, {
            selectedNodeId,
            hideCompletedGoals: viewSettings.hideCompletedGoals,
            hiddenInactiveGoalIds,
        })
    ), [fractalData, hiddenInactiveGoalIds, selectedNodeId, viewSettings.hideCompletedGoals]);
    const typeToZoomResults = useMemo(() => (
        getGoalSearchMatches(typeToZoomCandidates, typeToZoomQuery)
    ), [typeToZoomCandidates, typeToZoomQuery]);
    const activeDuplicateGroup = typeToZoomResults.activeDuplicateGroup;
    const activeDuplicateCount = activeDuplicateGroup?.length || 0;
    const visibleMatchCount = typeToZoomResults.matches.length;
    const activeCycleGroup = isTypeToZoomLocked ? typeToZoomResults.matches : activeDuplicateGroup;
    const activeCycleCount = activeCycleGroup?.length || 0;
    const cycleZoomTargetIsCurrent = Boolean(
        cycleZoomTargetNodeId && activeCycleGroup?.some((match) => match.id === cycleZoomTargetNodeId)
    );
    const effectiveZoomTargetNodeId = isTypeToZoomOpen && typeToZoomQuery && !isTypeToZoomLocked && visibleMatchCount === 1
        ? typeToZoomResults.matches[0].id
        : (cycleZoomTargetIsCurrent ? cycleZoomTargetNodeId : null);
    const duplicateCycleDisplay = activeDuplicateCount > 1
        ? `${(duplicateCycleIndex % activeDuplicateCount) + 1}/${activeDuplicateCount}`
        : null;
    const lockedCycleDisplay = isTypeToZoomLocked && activeCycleCount > 0
        ? `${(duplicateCycleIndex % activeCycleCount) + 1}/${activeCycleCount}`
        : null;

    const clearTypeToZoomSearch = useCallback(() => {
        setTypeToZoomQuery('');
        setIsTypeToZoomOpen(false);
        setIsTypeToZoomLocked(false);
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

        const idleDuration = isTypeToZoomLocked ? TYPE_TO_ZOOM_LOCKED_IDLE_MS : TYPE_TO_ZOOM_IDLE_MS;
        typeToZoomIdleTimerRef.current = setTimeout(() => {
            clearTypeToZoomSearch();
        }, idleDuration);

        return () => {
            if (typeToZoomIdleTimerRef.current) {
                clearTimeout(typeToZoomIdleTimerRef.current);
                typeToZoomIdleTimerRef.current = null;
            }
        };
    }, [
        clearTypeToZoomSearch,
        cycleZoomTargetNodeId,
        duplicateCycleIndex,
        isTypeToZoomLocked,
        isTypeToZoomOpen,
        typeToZoomQuery,
    ]);

    useEffect(() => () => {
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
    }, []);

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
                setIsTypeToZoomLocked(false);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                return;
            }

            if (event.key === 'Enter' && typeToZoomQuery && visibleMatchCount > 0) {
                event.preventDefault();
                setIsTypeToZoomLocked(true);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(typeToZoomResults.matches[0].id);
                return;
            }

            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && activeCycleCount > 1) {
                event.preventDefault();
                setDuplicateCycleIndex((current) => {
                    const direction = event.key === 'ArrowDown' ? 1 : -1;
                    const nextIndex = (current + direction + activeCycleCount) % activeCycleCount;
                    const nextTarget = activeCycleGroup[nextIndex];
                    if (nextTarget) setCycleZoomTargetNodeId(nextTarget.id);
                    return nextIndex;
                });
                return;
            }

            const queryCharacter = getQueryCharacter(event);
            if (queryCharacter) {
                event.preventDefault();
                setIsTypeToZoomOpen(true);
                setIsTypeToZoomLocked(false);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                setTypeToZoomQuery((current) => `${current}${queryCharacter}`);
            }
        };

        window.addEventListener('keydown', handleTypeToZoomKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomKeyDown, true);
    }, [
        activeCycleCount,
        activeCycleGroup,
        alertData.isOpen,
        clearTypeToZoomSearch,
        fractalToDelete,
        isTypeToZoomOpen,
        showGoalModal,
        typeToZoomQuery.length,
        typeToZoomQuery,
        typeToZoomResults.matches,
        visibleMatchCount,
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
            setIsTypeToZoomLocked(false);
            setDuplicateCycleIndex(0);
            setCycleZoomTargetNodeId(null);
            setTypeToZoomQuery(event.key);
        };

        window.addEventListener('keydown', handleTypeToZoomStartKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomStartKeyDown, true);
    }, [alertData.isOpen, fractalToDelete, isTypeToZoomOpen, showGoalModal]);

    useEffect(() => {
        if (!fractalData || !viewingGoal) return;
        const viewingId = getGoalNodeId(viewingGoal);
        const updatedGoal = findGoalNodeById(fractalData, viewingId);

        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

    const showAlert = useCallback((title, message) => {
        setAlertData({ isOpen: true, title, message });
    }, []);

    const handleGoalNameClick = useCallback((nodeDatum) => {
        setViewingGoal(nodeDatum);
        setSidebarMode('goal-details');
    }, []);

    const handleAddChildClick = useCallback((nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);

        if (!childType) {
            showAlert('Notice', 'This goal type cannot have children.');
            return;
        }

        setSelectedParent(nodeDatum);
        setShowGoalModal(true);
    }, [showAlert]);

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

    const handleCloseGoalDetails = useCallback(() => {
        setShowGoalModal(false);
        setSidebarMode(null);
        setViewingGoal(null);
    }, []);

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
    const shouldShowMobileGoalModal = isMobile && isSidebarOpen;
    const shouldShowDockedGoalPanel = isSidebarOpen && !isMobile;
    const handleToggleViewSetting = (settingKey) => (event) => {
        const nextChecked = event.target.checked;
        const shouldTransitionScope = settingKey === 'hideInactiveGoals' || settingKey === 'hideCompletedGoals';

        if (!shouldTransitionScope) {
            setViewSettings((prev) => ({
                ...prev,
                [settingKey]: nextChecked
            }));
            return;
        }

        flowTreeRef.current?.startFadeOut?.();
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
        flowTreeScopeTransitionTimerRef.current = setTimeout(() => {
            setViewSettings((prev) => ({
                ...prev,
                [settingKey]: nextChecked
            }));
            setFlowTreeScopeTransitionKey((prev) => prev + 1);
            flowTreeScopeTransitionTimerRef.current = null;
        }, FLOWTREE_SCOPE_TRANSITION_MS);
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
                    <FlowTreeOptionsPane
                        isMobile={isMobile}
                        isMinimized={isOptionsPaneMinimized}
                        onToggleMinimized={() => setIsOptionsPaneMinimized((prev) => !prev)}
                        goalsViewMode={goalsViewMode}
                        onGoalsViewModeChange={setGoalsViewMode}
                        viewSettings={viewSettings}
                        onToggleViewSetting={handleToggleViewSetting}
                        inactiveBranchTooltip={inactiveBranchTooltip}
                        hideInactiveTooltip={hideInactiveTooltip}
                        hideCompletedTooltip={hideCompletedTooltip}
                    />
                    {isTypeToZoomOpen && typeToZoomQuery && (
                        <div className="type-to-zoom-palette" role="status" aria-live="polite">
                            <div className="type-to-zoom-label">Find goal</div>
                            <div className="type-to-zoom-query">{renderTypeToZoomQuery(typeToZoomQuery)}</div>
                            <div className="type-to-zoom-meta">
                                {visibleMatchCount === 1
                                    ? '1 match'
                                    : `${visibleMatchCount} matches`}
                                {lockedCycleDisplay && (
                                    <span className="type-to-zoom-duplicate">Locked {lockedCycleDisplay}</span>
                                )}
                                {!lockedCycleDisplay && duplicateCycleDisplay && (
                                    <span className="type-to-zoom-duplicate">Duplicate {duplicateCycleDisplay}</span>
                                )}
                            </div>
                        </div>
                    )}
                    <FractalView
                        ref={flowTreeRef}
                        treeData={fractalData}
                        evidenceGoalIds={evidenceGoalIds}
                        metricsSummary={flowtreeMetricsSummary}
                        activeGoalWindowDays={activeGoalWindowDays}
                        activities={activities}
                        activityGroups={activityGroups}
                        programs={programs}
                        viewSettings={viewSettings}
                        scopeTransitionKey={flowTreeScopeTransitionKey}
                        onNodeClick={handleGoalNameClick}
                        selectedNodeId={selectedNodeId}
                        zoomTargetNodeId={effectiveZoomTargetNodeId}
                        onAddChild={handleAddChildClick}
                        sidebarOpen={isSidebarOpen}
                        layoutMode={goalsViewMode}
                        key={`${rootId}-${goalsViewMode}`}
                    />
                </div>

                {shouldShowDockedGoalPanel && (
                    <div className="details-window sidebar docked" style={{
                        width: sidebarWidth,
                        minWidth: minSidebarWidth,
                        height: 'calc(100% - 40px)',
                        position: 'relative',
                        top: 'auto',
                        right: 'auto',
                        bottom: 'auto',
                        left: 'auto',
                        margin: '20px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-sidebar)',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow-md)',
                        backdropFilter: 'blur(10px)'
                    }}>
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
                                    />
                                </ErrorBoundary>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {shouldShowMobileGoalModal && (
                <Suspense fallback={<div className="loading-spinner">Loading Goal Details...</div>}>
                    {showGoalModal ? (
                        <GoalDetailModal
                            isOpen={true}
                            onClose={handleCloseGoalDetails}
                            mode="create"
                            onCreate={handleCreateGoal}
                            parentGoal={selectedParent}
                            activityDefinitions={activities}
                            activityGroups={activityGroups}
                            rootId={rootId}
                            displayMode="modal"
                            onGoalSelect={(goal) => {
                                setShowGoalModal(false);
                                handleGoalNameClick(goal);
                            }}
                        />
                    ) : (
                        <GoalDetailModal
                            isOpen={true}
                            onClose={handleCloseGoalDetails}
                            goal={viewingGoal}
                            onUpdate={handleUpdateNode}
                            activityDefinitions={activities}
                            onToggleCompletion={handleToggleCompletion}
                            onAddChild={handleAddChildClick}
                            onDelete={(node) => setFractalToDelete(node)}
                            evidenceGoalIds={evidenceGoalIds}
                            rootId={rootId}
                            treeData={fractalData}
                            displayMode="modal"
                            programs={programs}
                            activityGroups={activityGroups}
                            onGoalSelect={handleGoalNameClick}
                        />
                    )}
                </Suspense>
            )}

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
