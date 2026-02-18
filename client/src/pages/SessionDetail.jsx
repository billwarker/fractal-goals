import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import SessionSection from '../components/sessionDetail/SessionSection';
import ConfirmationModal from '../components/ConfirmationModal';
import ActivityBuilder from '../components/ActivityBuilder';
import GoalDetailModal from '../components/GoalDetailModal';
import { SessionSidePane } from '../components/sessionDetail';
import useSessionNotes from '../hooks/useSessionNotes';
import styles from './SessionDetail.module.css';
import notify from '../utils/notify';
import '../App.css';
import { useGoals } from '../contexts/GoalsContext';
import ActivityAssociationModal from '../components/sessionDetail/ActivityAssociationModal';
import StatusState from '../components/common/StatusState';
import useIsMobile from '../hooks/useIsMobile';

// Context
import { ActiveSessionProvider, useActiveSession } from '../contexts/ActiveSessionContext';

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
    const { useFractalTreeQuery } = useGoals();
    const isMobile = useIsMobile();



    // Consume Active Session Context
    const {
        session,
        activityInstances,
        activities,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode,
        refreshSession,
        refreshInstances,
        localSessionData,
        groupedActivities,
        groupMap,
        targetAchievements,
        achievedTargetIds,
        // Handlers
        updateSession,
        addActivity,
        deleteSession,
        updateInstance,
        reorderActivity,
        moveActivity,
        updateGoal,
        toggleSessionComplete,
        calculateTotalDuration
    } = useActiveSession();

    // UI State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [isMobilePaneOpen, setIsMobilePaneOpen] = useState(false);

    // Pre-calculate full goal tree for association
    const { data: fullGoalTree } = useFractalTreeQuery(rootId);

    const allAvailableGoals = useMemo(() => {
        if (!fullGoalTree) return [];
        const goals = [];
        const processGoal = (g) => {
            const goalWithIds = { ...g, childrenIds: g.children ? g.children.map(c => c.id) : [] };
            goals.push(goalWithIds);
            if (g.children) g.children.forEach(processGoal);
        };
        if (Array.isArray(fullGoalTree)) fullGoalTree.forEach(processGoal);
        else if (fullGoalTree && typeof fullGoalTree === 'object') processGoal(fullGoalTree);
        return goals.filter(g => !g.completed);
    }, [fullGoalTree]);

    // Local Handlers
    const handleActivityFocus = (instance, setIndex = null) => {
        setSelectedActivity(instance);
        setSelectedSetIndex(setIndex);
    };

    const handleOpenGoals = (instance, context = null) => {
        if (context?.type === 'associate') {
            setAssociationContext(context);
            setShowAssociationModal(true);
            return;
        }
        setSelectedActivity(instance);
        setSelectedSetIndex(null);
        setSidePaneMode('goals');
        if (isMobile) {
            setIsMobilePaneOpen(true);
        }
    };

    const handleAssociateActivity = async (goalIds) => {
        const activityDef = associationContext?.activityDefinition;
        if (!activityDef) return;
        const idsToAssociate = Array.isArray(goalIds) ? goalIds : [goalIds];
        try {
            await fractalApi.setActivityGoals(rootId, activityDef.id, idsToAssociate);
            notify.success(`Activity associated successfully`);
            refreshSession();
        } catch (err) {
            notify.error('Failed to associate activity');
        }
    };

    const handleOpenActivityBuilder = (sectionIndex) => {
        setSectionForNewActivity(sectionIndex);
        setShowBuilder(true);
    };

    const handleActivityCreated = async (newActivity) => {
        if (!newActivity) return;
        if (sectionForNewActivity !== null) {
            addActivity(sectionForNewActivity, newActivity.id, newActivity);
            setSectionForNewActivity(null);
        }
    };

    const handleDeleteSessionClick = () => setShowDeleteConfirm(true);
    const handleConfirmDelete = async () => {
        await deleteSession();
        navigate(`/${rootId}/sessions`);
    };

    const handleSaveSession = () => {
        notify.success('Session saved successfully');
        navigate(`/${rootId}/sessions`);
    };

    // Notes Hook (Keeping for now as it's quite specialized)
    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

    useEffect(() => {
        if (!isMobile) {
            setIsMobilePaneOpen(false);
        }
    }, [isMobile]);

    const formatDuration = (seconds) => {
        if (!seconds || Number.isNaN(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

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
                            <span>Duration {formatDuration(totalDuration)}</span>
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
                        onDelete={handleDeleteSessionClick}
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
                            onDelete={handleDeleteSessionClick}
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
