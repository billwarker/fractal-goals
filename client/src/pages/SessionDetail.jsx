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

    if (loading) {
        return <div className="page-container"><div className={styles.statusMessage}><p>Loading session...</p></div></div>;
    }
    if (!session || !localSessionData) {
        return (
            <div className="page-container">
                <div className={styles.statusMessage}>
                    <h2>Session Not Found</h2>
                    <p>The session you're looking for doesn't exist or you don't have access.</p>
                    <button onClick={() => navigate(`/${rootId}/sessions`)} className="btn btn-primary">
                        Return to Sessions
                    </button>
                </div>
            </div>
        );
    }


    return (
        <div className={styles.sessionDetailContainer}>
            <div className={styles.sessionMainContent}>
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

            <div className={styles.sessionSidebarWrapper}>
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
                    />
                </div>
            </div>

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
                    {autoSaveStatus === 'saving' && '💾 Saving...'}
                    {autoSaveStatus === 'saved' && '✓ Saved'}
                    {autoSaveStatus === 'error' && '⚠ Error'}
                </div>
            )}
        </div>
    );
}

export default SessionDetail;
