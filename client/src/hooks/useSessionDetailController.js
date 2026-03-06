import { useEffect, useMemo, useState } from 'react';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { useGoals } from '../contexts/GoalsContext';
import { useActiveSession } from '../contexts/ActiveSessionContext';
import useSessionNotes from './useSessionNotes';

export function useSessionDetailController({ rootId, sessionId, navigate, isMobile }) {
    const { useFractalTreeQuery } = useGoals();

    const {
        session,
        activities,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode,
        refreshSession,
        localSessionData,
        addActivity,
        deleteSession,
        updateGoal,
        calculateTotalDuration
    } = useActiveSession();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [isMobilePaneOpen, setIsMobilePaneOpen] = useState(false);

    const { data: fullGoalTree } = useFractalTreeQuery(rootId);
    const allAvailableGoals = useMemo(() => {
        if (!fullGoalTree) return [];
        const goals = [];
        const processGoal = (goal) => {
            goals.push({
                ...goal,
                childrenIds: goal.children ? goal.children.map((child) => child.id) : []
            });
            if (goal.children) goal.children.forEach(processGoal);
        };
        if (Array.isArray(fullGoalTree)) fullGoalTree.forEach(processGoal);
        else if (typeof fullGoalTree === 'object') processGoal(fullGoalTree);
        return goals.filter((goal) => !goal.completed);
    }, [fullGoalTree]);

    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

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
        if (isMobile) setIsMobilePaneOpen(true);
    };

    const handleAssociateActivity = async (goalIds) => {
        const activityDef = associationContext?.activityDefinition;
        if (!activityDef) return;
        const idsToAssociate = Array.isArray(goalIds) ? goalIds : [goalIds];
        try {
            await fractalApi.setActivityGoals(rootId, activityDef.id, idsToAssociate);
            notify.success('Activity associated successfully');
            refreshSession();
        } catch {
            notify.error('Failed to associate activity');
        }
    };

    const handleOpenActivityBuilder = (sectionIndex) => {
        setSectionForNewActivity(sectionIndex);
        setShowBuilder(true);
    };

    const handleActivityCreated = async (newActivity) => {
        if (!newActivity || sectionForNewActivity == null) return;
        addActivity(sectionForNewActivity, newActivity.id, newActivity);
        setSectionForNewActivity(null);
    };

    const handleConfirmDelete = async () => {
        await deleteSession();
        navigate(`/${rootId}/sessions`, {
            state: { deletedSessionId: sessionId, deletedAt: Date.now() }
        });
    };

    const handleDeleteNote = async (noteOrId) => {
        // Support both old (ID only) and new (note object) formats
        const note = typeof noteOrId === 'object' ? noteOrId : sessionNotes.find(n => n.id === noteOrId);
        if (!note) return;

        try {
            // If it's a nano goal, delete the goal row as well
            if (note.is_nano_goal && note.nano_goal_id) {
                await updateGoal({ goalId: note.nano_goal_id, updates: { isDeleting: true } }); // Optional: help UI show transition
                await fractalApi.deleteGoal(rootId, note.nano_goal_id);
            }

            await deleteNote(note.id);
        } catch (err) {
            console.error("Failed to delete note/goal", err);
            notify.error("Failed to delete");
        }
    };

    const handleCreateNanoGoal = async (parent_id, content, activity_id) => {
        try {
            const goalData = {
                name: content,
                type: 'NanoGoal',
                parent_id: parent_id,
            };
            const newGoal = await createGoal(goalData);

            // Auto-associate the new Nano Goal with the current activity context
            if (newGoal && newGoal.id && activity_id) {
                try {
                    // Get parent's activities for inheritance
                    let parentActivityIds = [];
                    try {
                        const parentRes = await fractalApi.getGoalActivities(rootId, parent_id);
                        if (parentRes.data) {
                            parentActivityIds = parentRes.data.map(a => a.id);
                        }
                    } catch (e) {
                        console.warn("Could not fetch parent activities for Nano Goal inheritance", e);
                    }

                    // Combine inherited activities with the current activity context, avoiding duplicates
                    const activitiesToAssociate = [...new Set([...parentActivityIds, activity_id])];

                    await fractalApi.setGoalAssociationsBatch(rootId, newGoal.id, {
                        activity_ids: activitiesToAssociate,
                        group_ids: []
                    });
                } catch (assocErr) {
                    console.error("Failed to auto-associate activity to Nano Goal", assocErr);
                }
            }

            return newGoal;
        } catch (err) {
            console.error("Failed to create Nano Goal", err);
            notify.error("Failed to create Nano Goal");
            throw err;
        }
    };

    const handleSaveSession = () => {
        notify.success('Session saved successfully');
        navigate(`/${rootId}/sessions`);
    };

    useEffect(() => {
        if (!isMobile) setIsMobilePaneOpen(false);
    }, [isMobile]);

    return {
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
        deleteNote: handleDeleteNote,
        refreshNotes,
        handleActivityFocus,
        handleOpenGoals,
        handleAssociateActivity,
        handleOpenActivityBuilder,
        handleActivityCreated,
        handleConfirmDelete,
        handleSaveSession
    };
}
