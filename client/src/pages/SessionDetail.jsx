import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import SessionSection from '../components/sessionDetail/SessionSection';
import {
    SessionDetailMobileDock,
    SessionDetailModals,
    SessionDetailPaneLayout,
    QuickSessionWorkspace,
} from '../components/sessionDetail';
import styles from './SessionDetail.module.css';
import '../App.css';
import StatusState from '../components/common/StatusState';
import useIsMobile from '../hooks/useIsMobile';
import { useSessionDetailController } from '../hooks/useSessionDetailController';
import { isQuickSession } from '../utils/sessionRuntime';
import useExpandedProgressChart, { ProgressChartExpansionContext } from '../components/sessionDetail/useExpandedProgressChart';

const ExpandedProgressChart = lazy(() => import('../components/sessionDetail/ExpandedProgressChart'));

// Context
import { ActiveSessionProvider } from '../contexts/ActiveSessionContext';
import SessionSyncIndicator from '../components/sessionDetail/SessionSyncIndicator';
import { useOptionalOnboarding } from '../contexts/OnboardingContext';

/**
 * Session Detail Page Wrapper
 */
function SessionDetail() {
    const { rootId, sessionId } = useParams();

    return (
        <ActiveSessionProvider rootId={rootId} sessionId={sessionId}>
            <SessionDetailContent />
        </ActiveSessionProvider>
    );
}

/**
 * Session Detail UI Content
 */
function SessionDetailContent() {
    const { rootId, sessionId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isMobile = useIsMobile();
    const onboarding = useOptionalOnboarding();
    const appliedActivityTargetRef = useRef(null);
    const {
        session,
        activities,
        activityGroups,
        activityInstances,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode,
        localSessionData,
        updateGoal,
        toggleGoalCompletion,
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        builderActivity,
        builderInitialGoalIds,
        selectedGoal,
        setSelectedGoal,
        selectedActivity,
        selectedSetIndex,
        showAssociationModal,
        setShowAssociationModal,
        associationContext,
        isMobilePaneOpen,
        setIsMobilePaneOpen,
        allAvailableGoals,
        sessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes,
        sidePaneModel,
        handleActivityFocus,
        handleOpenGoals,
        handleAssociateActivity,
        handleGoalAssociationsChanged,
        handleOpenActivityBuilder,
        handleCloseActivityBuilder,
        handleActivityCreated,
        handleConfirmDelete,
        showOptionsModal,
        setShowOptionsModal,
        handleCreateTemplate,
        handleDuplicateSession,
        canDuplicateSession,
        handlePauseResume,
        handleDeleteSessionRequest,
        isSavingTemplate,
        isDuplicatingSession,
        activityGoalScope,
    } = useSessionDetailController({ rootId, sessionId, navigate, isMobile });

    const autoSavePill = autoSaveStatus ? (
        <div className={`${styles.autoSaveIndicator} ${autoSaveStatus === 'saved' ? styles.autoSaveSaved : autoSaveStatus === 'error' ? styles.autoSaveError : styles.autoSaveDefault}`}>
            {autoSaveStatus === 'saving' && 'Saving changes...'}
            {autoSaveStatus === 'saved' && 'Saved'}
            {autoSaveStatus === 'error' && 'Save failed'}
        </div>
    ) : null;
    // With offline sync on, the sync indicator owns this slot and falls back to the save pill.
    const saveStatusIndicator = (
        <SessionSyncIndicator
            sessionId={sessionId}
            fallback={autoSavePill}
            className={styles.syncIndicatorSlot}
        />
    );
    const isCompleted = Boolean(session?.attributes?.completed);
    const expandedChart = useExpandedProgressChart({ isMobile, sidePaneMode, setIsMobilePaneOpen });

    useEffect(() => {
        if (isCompleted && onboarding?.enabled) onboarding.refresh();
    }, [isCompleted, onboarding]);

    const targetActivityInstanceId = searchParams.get('activityInstanceId');

    useEffect(() => {
        if (loading || !targetActivityInstanceId || !Array.isArray(activityInstances)) return undefined;

        const targetKey = `${sessionId}:${targetActivityInstanceId}`;
        if (appliedActivityTargetRef.current === targetKey) return undefined;

        const targetInstance = activityInstances.find((instance) => instance.id === targetActivityInstanceId);
        if (!targetInstance) return undefined;

        appliedActivityTargetRef.current = targetKey;
        handleActivityFocus(targetInstance, null);

        const timeoutId = window.setTimeout(() => {
            const escapedId = typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(targetActivityInstanceId)
                : targetActivityInstanceId.replace(/"/g, '\\"');
            const element = document.querySelector(`[data-session-activity-instance-id="${escapedId}"]`);
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [activityInstances, handleActivityFocus, loading, sessionId, targetActivityInstanceId]);

    if (loading) {
        return (
            <div className="page-container">
                <div className={styles.statusWrapper}>
                    <StatusState
                        title="Loading Session"
                        description="Fetching your sections, activities, notes, and goals."
                    />
                </div>
            </div>
        );
    }
    if (!session || !localSessionData) {
        return (
            <div className="page-container">
                <div className={styles.statusWrapper}>
                    <StatusState
                        title="Session Not Found"
                        description="The requested session does not exist or is no longer available."
                        actionLabel="Return to Sessions"
                        onAction={() => navigate(`/${rootId}/sessions`)}
                    />
                </div>
            </div>
        );
    }

    if (isQuickSession(session)) {
        return (
            <div className={styles.sessionDetailContainer}>
                <div className={styles.sessionMainContent} data-session-detail-content>
                    <QuickSessionWorkspace onOpenActivityBuilder={handleOpenActivityBuilder} />
                </div>

                <SessionDetailModals
                    rootId={rootId}
                    activities={activities}
                    activityGroups={activityGroups}
                    showDeleteConfirm={showDeleteConfirm}
                    onCloseDeleteConfirm={() => setShowDeleteConfirm(false)}
                    onConfirmDelete={handleConfirmDelete}
                    showBuilder={showBuilder}
                    builderActivity={builderActivity}
                builderInitialGoalIds={builderInitialGoalIds}
                    onCloseBuilder={handleCloseActivityBuilder}
                    onActivityCreated={handleActivityCreated}
                    selectedGoal={selectedGoal}
                    onCloseGoal={() => setSelectedGoal(null)}
                    onUpdateGoal={async (goalId, updates) => {
                        const response = await updateGoal({ goalId, updates });
                        if (response?.data) setSelectedGoal(response.data);
                        return response?.data || response;
                    }}
                    onToggleGoalCompletion={async (goalId, currentStatus, sequenceOptions = null) => {
                        const response = await toggleGoalCompletion({ goalId, completed: !currentStatus, sequenceOptions });
                        if (response?.data) setSelectedGoal(response.data);
                        return response;
                    }}
                    onGoalAssociationsChanged={handleGoalAssociationsChanged}
                    showAssociationModal={showAssociationModal}
                    onCloseAssociationModal={() => setShowAssociationModal(false)}
                    associationContext={associationContext}
                    allAvailableGoals={allAvailableGoals}
                    onAssociateActivity={handleAssociateActivity}
                    showOptionsModal={showOptionsModal}
                    onCloseOptionsModal={() => setShowOptionsModal(false)}
                    sessionName={session?.name}
                    onCreateTemplate={handleCreateTemplate}
                    onDuplicateSession={handleDuplicateSession}
                    canDuplicateSession={canDuplicateSession}
                    onPauseResume={handlePauseResume}
                    onDeleteSessionRequest={handleDeleteSessionRequest}
                    isPaused={Boolean(session?.is_paused)}
                    isCompleted={Boolean(session?.attributes?.completed)}
                    isSavingTemplate={isSavingTemplate}
                    isDuplicatingSession={isDuplicatingSession}
                />

                {saveStatusIndicator}
            </div>
        );
    }

    const selectedModeLabel = sidePaneMode.charAt(0).toUpperCase() + sidePaneMode.slice(1);

    return (
        <ProgressChartExpansionContext.Provider value={expandedChart.context}>
        <div className={styles.sessionDetailContainer}>
            <div className={styles.sessionMainArea}>
            {/* An expanded Progress chart takes the content's place; the content stays mounted, hidden. */}
            <div
                className={styles.sessionMainContent}
                data-session-detail-content
                data-hidden={expandedChart.isContentHidden || undefined}
                inert={expandedChart.isContentHidden || undefined}
            >
                <div className={styles.sessionSectionsList}>
                    {localSessionData.sections?.map((section, sectionIndex) => (
                        <SessionSection
                            key={sectionIndex}
                            section={section}
                            sectionIndex={sectionIndex}
                            onFocusActivity={handleActivityFocus}
                            selectedActivityId={selectedActivity?.id}
                            selectedSetIndex={selectedSetIndex}
                            onOpenActivityBuilder={handleOpenActivityBuilder}
                            onNoteCreated={refreshNotes}
                            allNotes={sessionNotes}
                            onAddNote={addNote}
                            onUpdateNote={updateNote}
                            onDeleteNote={deleteNote}
                            onOpenGoals={handleOpenGoals}
                            activityGoalScope={activityGoalScope}
                        />
                    ))}
                </div>
            </div>
            {expandedChart.activeChart ? (
                <Suspense fallback={null}>
                    <ExpandedProgressChart
                        rootId={rootId}
                        chart={expandedChart.activeChart}
                        instances={activityInstances}
                        activityDefs={sidePaneModel?.progress?.sessionActivityDefs}
                        onClose={expandedChart.collapse}
                        isLeaving={expandedChart.isLeaving}
                    />
                </Suspense>
            ) : null}
            </div>

            <SessionDetailPaneLayout
                isMobile={isMobile}
                isMobilePaneOpen={isMobilePaneOpen}
                onCloseMobilePane={() => setIsMobilePaneOpen(false)}
                selectedModeLabel={selectedModeLabel}
                sidePaneModel={sidePaneModel}
            />

            <SessionDetailModals
                rootId={rootId}
                activities={activities}
                activityGroups={activityGroups}
                showDeleteConfirm={showDeleteConfirm}
                onCloseDeleteConfirm={() => setShowDeleteConfirm(false)}
                onConfirmDelete={handleConfirmDelete}
                showBuilder={showBuilder}
                builderActivity={builderActivity}
                builderInitialGoalIds={builderInitialGoalIds}
                onCloseBuilder={handleCloseActivityBuilder}
                onActivityCreated={handleActivityCreated}
                selectedGoal={selectedGoal}
                onCloseGoal={() => setSelectedGoal(null)}
                onUpdateGoal={async (goalId, updates) => {
                    const response = await updateGoal({ goalId, updates });
                    if (response?.data) setSelectedGoal(response.data);
                    return response?.data || response;
                }}
                onToggleGoalCompletion={async (goalId, currentStatus, sequenceOptions = null) => {
                    const response = await toggleGoalCompletion({ goalId, completed: !currentStatus, sequenceOptions });
                    if (response?.data) setSelectedGoal(response.data);
                    return response;
                }}
                onGoalAssociationsChanged={handleGoalAssociationsChanged}
                showAssociationModal={showAssociationModal}
                onCloseAssociationModal={() => setShowAssociationModal(false)}
                associationContext={associationContext}
                allAvailableGoals={allAvailableGoals}
                onAssociateActivity={handleAssociateActivity}
                showOptionsModal={showOptionsModal}
                onCloseOptionsModal={() => setShowOptionsModal(false)}
                sessionName={session?.name}
                onCreateTemplate={handleCreateTemplate}
                onDuplicateSession={handleDuplicateSession}
                canDuplicateSession={canDuplicateSession}
                onPauseResume={handlePauseResume}
                onDeleteSessionRequest={handleDeleteSessionRequest}
                isPaused={Boolean(session?.is_paused)}
                isCompleted={isCompleted}
                isSavingTemplate={isSavingTemplate}
                isDuplicatingSession={isDuplicatingSession}
            />

            {saveStatusIndicator}

            {isMobile && (
                <SessionDetailMobileDock
                    sidePaneMode={sidePaneMode}
                    onModeSelect={(modeOption) => {
                        setSidePaneMode(modeOption);
                        setIsMobilePaneOpen(true);
                    }}
                />
            )}
        </div>
        </ProgressChartExpansionContext.Provider>
    );
}

export default SessionDetail;
