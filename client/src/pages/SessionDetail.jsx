import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import SessionSection from '../components/sessionDetail/SessionSection';
import ConfirmationModal from '../components/ConfirmationModal';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatForInput } from '../utils/dateUtils';
import ActivityBuilder from '../components/ActivityBuilder';
import GoalDetailModal from '../components/GoalDetailModal';
import { SessionSidePane } from '../components/sessionDetail';
import useSessionNotes from '../hooks/useSessionNotes';
import useTargetAchievements from '../hooks/useTargetAchievements';
import styles from './SessionDetail.module.css';
import notify from '../utils/notify';
import '../App.css';
import { useGoals } from '../contexts/GoalsContext';
import ActivityAssociationModal from '../components/sessionDetail/ActivityAssociationModal';

// Custom Hooks
import { useSessionLogic } from '../hooks/useSessionLogic';
import { useSessionTimer } from '../hooks/useSessionTimer';

/**
 * Session Detail Page
 * Refactored to use useSessionLogic and useSessionTimer hooks.
 */
function SessionDetail() {
    const { rootId, sessionId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const { useFractalTreeQuery } = useGoals();

    // 1. Core Session Logic
    const {
        session, setSession,
        sessionData, setSessionData,
        activityInstances,
        loading,
        activities, setActivities,
        activityGroups,
        parentGoals, setParentGoals,
        immediateGoals,
        microGoals,
        showActivitySelector, setShowActivitySelector,
        autoSaveStatus,
        fetchSession, fetchActivities, fetchActivityInstances,
        handleAddActivity,
        handleDeleteActivity,
        handleReorderActivity,
        handleUpdateActivity,
        handleMoveActivity,
        handleConfirmDeleteSession,
        handleUpdateGoal,
        handleToggleSessionComplete
    } = useSessionLogic(rootId, sessionId);

    // 2. Timer Logic
    const {
        calculateTotalCompletedDuration,
        handleSessionStartChange,
        handleSessionEndChange,
        handleSectionDurationChange
    } = useSessionTimer(sessionData, setSessionData, activityInstances);

    // 3. UI State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [draggedItem, setDraggedItem] = useState(null);
    const [createMicroTrigger, setCreateMicroTrigger] = useState(0);
    const [goalCreationContext, setGoalCreationContext] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [notifiedTargetIds, setNotifiedTargetIds] = useState(new Set());
    const [localSessionStart, setLocalSessionStart] = useState('');
    const [localSessionEnd, setLocalSessionEnd] = useState('');

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
        setGoalCreationContext(context);
        setCreateMicroTrigger(prev => prev + 1);
    };

    const handleAssociateActivity = async (goalIds) => {
        const activityDef = associationContext?.activityDefinition;
        if (!activityDef) return;
        const idsToAssociate = Array.isArray(goalIds) ? goalIds : [goalIds];
        try {
            await fractalApi.setActivityGoals(rootId, activityDef.id, idsToAssociate);
            const count = idsToAssociate.length;
            notify.success(`Activity associated with ${count} goal${count !== 1 ? 's' : ''} successfully`);
            await fetchActivities();
        } catch (err) {
            console.error("Failed to associate activity", err);
            notify.error('Failed to associate activity');
        }
    };

    const handleOpenActivityBuilder = (sectionIndex) => {
        setSectionForNewActivity(sectionIndex);
        setShowBuilder(true);
    };

    const handleActivityCreated = async (newActivity) => {
        if (!newActivity) return;
        setActivities(prev => [...prev, newActivity]);
        if (sectionForNewActivity !== null) {
            await handleAddActivity(sectionForNewActivity, newActivity.id, newActivity);
            setSectionForNewActivity(null);
        }
        await fetchActivities();
    };

    const handleGoalCreated = async (newGoalName) => {
        notify.success(newGoalName ? `Goal "${newGoalName}" created successfully` : "Goal created successfully");
        await Promise.all([fetchSession(), fetchActivities()]);
    };

    const handleDeleteSessionClick = () => setShowDeleteConfirm(true);
    const handleSaveSession = async () => {
        notify.success('Session saved successfully');
        navigate(`/${rootId}/sessions`);
    };

    // Derived Data
    const groupedActivities = useMemo(() => activities.reduce((acc, activity) => {
        const groupId = activity.group_id || 'ungrouped';
        if (!acc[groupId]) acc[groupId] = [];
        acc[groupId].push(activity);
        return acc;
    }, {}), [activities]);

    const groupMap = useMemo(() => activityGroups.reduce((acc, group) => {
        acc[group.id] = group;
        return acc;
    }, { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } }), [activityGroups]);

    // Notes Hook
    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

    // Target Achievements Hook
    const allGoalsForTargets = useMemo(() => [...parentGoals, ...(session?.immediate_goals || [])], [parentGoals, session?.immediate_goals]);
    const {
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
    } = useTargetAchievements(activityInstances, allGoalsForTargets);

    // Notifications Effects
    // 1. Targets
    const prevAchievedTargetIdsRef = useRef(new Set());
    useEffect(() => {
        if (!achievedTargetIds || !targetAchievements) return;
        const prevAchieved = prevAchievedTargetIdsRef.current;

        const newlyAchieved = [];
        for (const targetId of achievedTargetIds) {
            if (!notifiedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status && !status.wasAlreadyCompleted) newlyAchieved.push(status);
            }
        }
        if (newlyAchieved.length > 0) {
            const names = newlyAchieved.map(s => s.target.name || 'Target').join(', ');
            notify.success(`🎯 Target achieved: ${names}`, { duration: 5000 });
            setNotifiedTargetIds(prev => {
                const newSet = new Set(prev);
                newlyAchieved.forEach(s => newSet.add(s.target.id));
                return newSet;
            });
        }

        const newlyReverted = [];
        for (const targetId of prevAchieved) {
            if (!achievedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status) newlyReverted.push(status);
            }
        }
        if (newlyReverted.length > 0) {
            const names = newlyReverted.map(s => s.target.name || 'Target').join(', ');
            notify.error(`🔙 Target reverted: ${names}`, { duration: 5000 });
            setNotifiedTargetIds(prev => {
                const newSet = new Set(prev);
                newlyReverted.forEach(s => newSet.delete(s.target.id));
                return newSet;
            });
        }
        prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
    }, [achievedTargetIds, targetAchievements, notifiedTargetIds]);

    // 2. Goals
    const prevCompletedIdsRef = React.useRef(new Set());
    useEffect(() => {
        if (!goalAchievements) return;
        const currentCompleteds = new Set();
        goalAchievements.forEach((status, goalId) => {
            if (status.allAchieved) currentCompleteds.add(goalId);
        });

        const prevCompleted = prevCompletedIdsRef.current;
        const newlyCompleted = [];
        for (const goalId of currentCompleteds) {
            if (!prevCompleted.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status && !status.wasAlreadyCompleted) newlyCompleted.push(status);
            }
        }
        if (newlyCompleted.length > 0) {
            const names = newlyCompleted.map(s => s.goalName).join(', ');
            notify.success(`🏆 Goal completed: ${names}`, { duration: 6000 });
        }

        const newlyUncompleted = [];
        for (const goalId of prevCompleted) {
            if (!currentCompleteds.has(goalId)) {
                const status = goalAchievements.get(goalId);
                newlyUncompleted.push(status);
            }
        }
        if (newlyUncompleted.length > 0) {
            const names = newlyUncompleted.map(s => s.goalName).join(', ');
            notify.error(`⚠️ Goal uncompleted: ${names}`, { duration: 6000 });
        }
        prevCompletedIdsRef.current = currentCompleteds;
    }, [goalAchievements]);

    // Sync local datetime fields
    useEffect(() => {
        if (!sessionData) return;
        setLocalSessionStart(sessionData.session_start ? formatForInput(sessionData.session_start, timezone) : '');
        setLocalSessionEnd(sessionData.session_end ? formatForInput(sessionData.session_end, timezone) : '');
    }, [sessionData?.session_start, sessionData?.session_end, timezone]);

    if (loading) {
        return <div className="page-container"><div className={styles.statusMessage}><p>Loading session...</p></div></div>;
    }
    if (!session || !sessionData) {
        return <div className="page-container"><div className={styles.statusMessage}><p>Session not found</p></div></div>;
    }

    return (
        <div className={styles.sessionDetailContainer}>
            <div className={styles.sessionMainContent}>
                <div className={styles.sessionSectionsList}>
                    {sessionData.sections?.map((section, sectionIndex) => (
                        <SessionSection
                            key={sectionIndex}
                            section={section}
                            sectionIndex={sectionIndex}
                            activityInstances={activityInstances}
                            onDeleteActivity={handleDeleteActivity}
                            onUpdateActivity={handleUpdateActivity}
                            onFocusActivity={handleActivityFocus}
                            selectedActivityId={selectedActivity?.id}
                            rootId={rootId}
                            showActivitySelector={showActivitySelector[sectionIndex]}
                            onToggleActivitySelector={(val) => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: typeof val === 'boolean' ? val : !prev[sectionIndex] }))}
                            onAddActivity={handleAddActivity}
                            onOpenActivityBuilder={handleOpenActivityBuilder}
                            groupedActivities={groupedActivities}
                            groupMap={groupMap}
                            activities={activities}
                            onNoteCreated={refreshNotes}
                            sessionId={sessionId}
                            allNotes={sessionNotes}
                            onAddNote={addNote}
                            onUpdateNote={updateNote}
                            onDeleteNote={deleteNote}
                            onOpenGoals={handleOpenGoals}
                            onMoveActivity={handleMoveActivity}
                            onReorderActivity={handleReorderActivity}
                            draggedItem={draggedItem}
                            setDraggedItem={setDraggedItem}
                            parentGoals={parentGoals}
                            immediateGoals={immediateGoals}
                            microGoals={microGoals}
                            session={session}
                        />
                    ))}
                </div>
            </div>

            <div className={styles.sessionSidebarWrapper}>
                <div className={styles.sessionSidebarSticky}>
                    <SessionSidePane
                        rootId={rootId}
                        sessionId={sessionId}
                        session={session}
                        sessionData={sessionData}
                        parentGoals={parentGoals}
                        totalDuration={calculateTotalCompletedDuration()}
                        selectedActivity={selectedActivity}
                        selectedSetIndex={selectedSetIndex}
                        activityInstances={activityInstances}
                        activityDefinitions={activities}
                        onNoteAdded={refreshNotes}
                        onGoalClick={(goal) => setSelectedGoal(goal)}
                        refreshTrigger={0}
                        notes={sessionNotes}
                        previousNotes={previousNotes}
                        previousSessionNotes={previousSessionNotes}
                        addNote={addNote}
                        updateNote={updateNote}
                        deleteNote={deleteNote}
                        isCompleted={session.attributes?.completed}
                        onDelete={handleDeleteSessionClick}
                        onCancel={() => navigate(`/${rootId}/sessions`)}
                        onGoalCreated={handleGoalCreated}
                        targetAchievements={targetAchievements}
                        achievedTargetIds={achievedTargetIds}
                        onToggleComplete={handleToggleSessionComplete}
                        createMicroTrigger={createMicroTrigger}
                        goalCreationContext={goalCreationContext}
                        onSave={handleSaveSession}
                        mode={sidePaneMode}
                        onModeChange={setSidePaneMode}
                        onOpenGoals={handleOpenGoals}
                        onSessionChange={(updatedSession) => {
                            setSession(updatedSession);
                            if (updatedSession.session_start || updatedSession.session_end) {
                                setSessionData(prev => ({
                                    ...prev,
                                    session_start: updatedSession.session_start,
                                    session_end: updatedSession.session_end
                                }));
                            }
                        }}
                    />
                </div>
            </div>

            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleConfirmDeleteSession}
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
                onUpdate={handleUpdateGoal}
                activityDefinitions={activities}
                activityGroups={activityGroups}
                rootId={rootId}
                onAssociationsChanged={fetchActivities}
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
