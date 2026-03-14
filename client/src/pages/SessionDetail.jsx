import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SessionSection from '../components/sessionDetail/SessionSection';
import {
    SessionDetailMobileChrome,
    SessionDetailMobileDock,
    SessionDetailModals,
    SessionDetailPaneLayout,
} from '../components/sessionDetail';
import styles from './SessionDetail.module.css';
import '../App.css';
import StatusState from '../components/common/StatusState';
import useIsMobile from '../hooks/useIsMobile';
import { useSessionDetailController } from '../hooks/useSessionDetailController';

// Context
import { ActiveSessionProvider } from '../contexts/ActiveSessionContext';

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
    const isMobile = useIsMobile();
    const {
        session,
        activities,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode,
        localSessionData,
        updateGoal,
        toggleGoalCompletion,
        calculateTotalDuration,
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        builderActivity,
        selectedGoal,
        setSelectedGoal,
        selectedActivity,
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
        handleConfirmDelete
    } = useSessionDetailController({ rootId, sessionId, navigate, isMobile });

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

    const totalDuration = calculateTotalDuration();
    const isCompleted = Boolean(session?.attributes?.completed);
    const selectedModeLabel = sidePaneMode.charAt(0).toUpperCase() + sidePaneMode.slice(1);

    return (
        <div className={styles.sessionDetailContainer}>
            <div className={styles.sessionMainContent}>
                {isMobile && (
                    <SessionDetailMobileChrome
                        sessionName={session?.name}
                        isCompleted={isCompleted}
                        totalDuration={totalDuration}
                        selectedModeLabel={selectedModeLabel}
                        onOpenPane={() => setIsMobilePaneOpen(true)}
                    />
                )}
                <div className={styles.sessionSectionsList}>
                    {localSessionData.sections?.map((section, sectionIndex) => (
                        <SessionSection
                            key={sectionIndex}
                            section={section}
                            sectionIndex={sectionIndex}
                            onFocusActivity={handleActivityFocus}
                            selectedActivityId={selectedActivity?.id}
                            onOpenActivityBuilder={handleOpenActivityBuilder}
                            onNoteCreated={refreshNotes}
                            allNotes={sessionNotes}
                            onAddNote={addNote}
                            onUpdateNote={updateNote}
                            onDeleteNote={deleteNote}
                            onOpenGoals={handleOpenGoals}
                        />
                    ))}
                </div>
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
                showDeleteConfirm={showDeleteConfirm}
                onCloseDeleteConfirm={() => setShowDeleteConfirm(false)}
                onConfirmDelete={handleConfirmDelete}
                showBuilder={showBuilder}
                builderActivity={builderActivity}
                onCloseBuilder={handleCloseActivityBuilder}
                onActivityCreated={handleActivityCreated}
                selectedGoal={selectedGoal}
                onCloseGoal={() => setSelectedGoal(null)}
                onUpdateGoal={(goalId, updates) => updateGoal({ goalId, updates })}
                onToggleGoalCompletion={(goalId, currentStatus) =>
                    toggleGoalCompletion({ goalId, completed: !currentStatus })
                }
                onGoalAssociationsChanged={handleGoalAssociationsChanged}
                showAssociationModal={showAssociationModal}
                onCloseAssociationModal={() => setShowAssociationModal(false)}
                associationContext={associationContext}
                allAvailableGoals={allAvailableGoals}
                onAssociateActivity={handleAssociateActivity}
            />

            {autoSaveStatus && (
                <div className={`${styles.autoSaveIndicator} ${autoSaveStatus === 'saved' ? styles.autoSaveSaved : autoSaveStatus === 'error' ? styles.autoSaveError : styles.autoSaveDefault}`}>
                    {autoSaveStatus === 'saving' && 'Saving changes...'}
                    {autoSaveStatus === 'saved' && 'Saved'}
                    {autoSaveStatus === 'error' && 'Save failed'}
                </div>
            )}

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
    );
}

export default SessionDetail;
