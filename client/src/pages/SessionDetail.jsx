import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SessionSection from '../components/sessionDetail/SessionSection';
import ConfirmationModal from '../components/ConfirmationModal';
import ActivityBuilder from '../components/ActivityBuilder';
import GoalDetailModal from '../components/GoalDetailModal';
import { SessionSidePane } from '../components/sessionDetail';
import styles from './SessionDetail.module.css';
import '../App.css';
import ActivityAssociationModal from '../components/sessionDetail/ActivityAssociationModal';
import StatusState from '../components/common/StatusState';
import useIsMobile from '../hooks/useIsMobile';
import { formatClockDuration } from '../utils/sessionTime';
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
        refreshSession,
        localSessionData,
        updateGoal,
        calculateTotalDuration,
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        setShowBuilder,
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
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes,
        handleActivityFocus,
        handleOpenGoals,
        handleAssociateActivity,
        handleOpenActivityBuilder,
        handleActivityCreated,
        handleConfirmDelete,
        handleSaveSession
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
                    <div className={styles.mobileSessionHeader}>
                        <div className={styles.mobileSessionTitleRow}>
                            <h1 className={styles.mobileSessionTitle}>{session?.name || 'Session'}</h1>
                            <span className={`${styles.mobileSessionStatus} ${isCompleted ? styles.mobileSessionStatusDone : ''}`}>
                                {isCompleted ? 'Complete' : 'In progress'}
                            </span>
                        </div>
                        <div className={styles.mobileSessionMeta}>
                            <span>Duration {formatClockDuration(totalDuration)}</span>
                            <button
                                type="button"
                                className={styles.mobileOpenPaneButton}
                                onClick={() => setIsMobilePaneOpen(true)}
                            >
                                Open {selectedModeLabel}
                            </button>
                        </div>
                    </div>
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

            <div className={`${styles.sessionSidebarWrapper} ${isMobile ? styles.sessionSidebarHidden : ''}`}>
                <div className={styles.sessionSidebarSticky}>
                    <SessionSidePane
                        selectedActivity={selectedActivity}
                        selectedSetIndex={selectedSetIndex}
                        onNoteAdded={refreshNotes}
                        onGoalClick={(goal) => setSelectedGoal(goal)}
                        notes={sessionNotes}
                        previousNotes={previousNotes}
                        previousSessionNotes={previousSessionNotes}
                        addNote={addNote}
                        updateNote={updateNote}
                        deleteNote={deleteNote}
                        onDelete={() => setShowDeleteConfirm(true)}
                        onCancel={() => navigate(`/${rootId}/sessions`)}
                        onGoalCreated={refreshSession}
                        onSave={handleSaveSession}
                        onOpenGoals={handleOpenGoals}
                        mode={sidePaneMode}
                        onModeChange={setSidePaneMode}
                        showModeTabs={!isMobile}
                    />
                </div>
            </div>

            {isMobile && isMobilePaneOpen && (
                <div
                    className={styles.mobilePaneOverlay}
                    onClick={() => setIsMobilePaneOpen(false)}
                    role="presentation"
                >
                    <div
                        className={styles.mobilePaneSheet}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.mobilePaneHeader}>
                            <div className={styles.mobilePaneTitle}>{selectedModeLabel}</div>
                            <button
                                type="button"
                                className={styles.mobilePaneClose}
                                onClick={() => setIsMobilePaneOpen(false)}
                                aria-label="Close panel"
                            >
                                ×
                            </button>
                        </div>
                        <SessionSidePane
                            selectedActivity={selectedActivity}
                            selectedSetIndex={selectedSetIndex}
                            onNoteAdded={refreshNotes}
                            onGoalClick={(goal) => setSelectedGoal(goal)}
                            notes={sessionNotes}
                            previousNotes={previousNotes}
                            previousSessionNotes={previousSessionNotes}
                            addNote={addNote}
                            updateNote={updateNote}
                            deleteNote={deleteNote}
                            onDelete={() => setShowDeleteConfirm(true)}
                            onCancel={() => navigate(`/${rootId}/sessions`)}
                            onGoalCreated={refreshSession}
                            onSave={handleSaveSession}
                            onOpenGoals={handleOpenGoals}
                            mode={sidePaneMode}
                            onModeChange={setSidePaneMode}
                            showModeTabs={false}
                            embedded
                        />
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Session"
                message="Are you sure you want to delete this session? This action cannot be undone."
                confirmText="Delete"
            />

            <ActivityBuilder
                isOpen={showBuilder}
                onClose={() => setShowBuilder(false)}
                rootId={rootId}
                onSave={handleActivityCreated}
            />

            <GoalDetailModal
                isOpen={!!selectedGoal}
                onClose={() => setSelectedGoal(null)}
                goal={selectedGoal}
                onUpdate={(goalId, updates) => updateGoal({ goalId, updates })}
                activityDefinitions={activities}
                rootId={rootId}
                onAssociationsChanged={refreshSession}
            />

            <ActivityAssociationModal
                isOpen={showAssociationModal}
                onClose={() => setShowAssociationModal(false)}
                onAssociate={handleAssociateActivity}
                initialActivityName={associationContext?.activityDefinition?.name}
                initialSelectedGoalIds={associationContext?.initialSelectedGoalIds || []}
                goals={allAvailableGoals}
            />

            {autoSaveStatus && (
                <div className={`${styles.autoSaveIndicator} ${autoSaveStatus === 'saved' ? styles.autoSaveSaved : autoSaveStatus === 'error' ? styles.autoSaveError : styles.autoSaveDefault}`}>
                    {autoSaveStatus === 'saving' && 'Saving changes...'}
                    {autoSaveStatus === 'saved' && 'Saved'}
                    {autoSaveStatus === 'error' && 'Save failed'}
                </div>
            )}

            {isMobile && (
                <div className={styles.mobileBottomDock}>
                    {['details', 'goals', 'history'].map((modeOption) => (
                        <button
                            key={modeOption}
                            type="button"
                            className={`${styles.mobileDockTab} ${sidePaneMode === modeOption ? styles.mobileDockTabActive : ''}`}
                            onClick={() => {
                                setSidePaneMode(modeOption);
                                setIsMobilePaneOpen(true);
                            }}
                        >
                            {modeOption.charAt(0).toUpperCase() + modeOption.slice(1)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SessionDetail;
