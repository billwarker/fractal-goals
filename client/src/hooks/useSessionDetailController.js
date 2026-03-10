import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { flattenGoalTree } from '../utils/goalNodeModel';
import { queryKeys } from './queryKeys';
import notify from '../utils/notify';
import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../contexts/ActiveSessionContext';
import { useGoalsForSelection } from './useGoalQueries';
import useSessionNotes from './useSessionNotes';

export function useSessionDetailController({ rootId, sessionId, navigate, isMobile }) {
    const queryClient = useQueryClient();
    const {
        session,
        activities,
        loading,
        autoSaveStatus,
        localSessionData,
        calculateTotalDuration,
        sessionGoalsView,
    } = useActiveSessionData();
    const {
        updateGoal,
        addActivity,
        deleteSession,
    } = useActiveSessionActions();
    const { sidePaneMode, setSidePaneMode: setSidePaneModeUi } = useActiveSessionUi();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [isMobilePaneOpen, setIsMobilePaneOpen] = useState(false);

    const { goals: selectionGoals = [] } = useGoalsForSelection(rootId, { enabled: showAssociationModal });
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const sessionKey = queryKeys.session(rootId, sessionId);
    const activitiesKey = queryKeys.activities(rootId);
    const fractalTreeKey = queryKeys.fractalTree(rootId);
    const allAvailableGoals = useMemo(() => {
        const availableMicroGoals = Array.isArray(sessionGoalsView?.micro_goals)
            ? sessionGoalsView.micro_goals
            : [];

        const microByParent = availableMicroGoals.reduce((acc, goal) => {
            const parentId = goal?.parent_id || goal?.attributes?.parent_id;
            if (!parentId) return acc;
            if (!acc.has(parentId)) acc.set(parentId, []);
            acc.get(parentId).push(goal);
            return acc;
        }, new Map());

        const roots = (selectionGoals || []).map((shortTermGoal) => {
            const immediateGoals = Array.isArray(shortTermGoal.immediateGoals) ? shortTermGoal.immediateGoals : [];
            return {
                ...shortTermGoal,
                type: shortTermGoal.type || 'ShortTermGoal',
                children: immediateGoals.map((immediateGoal) => ({
                    ...immediateGoal,
                    children: microByParent.get(immediateGoal.id) || [],
                })),
            };
        });

        const flattened = roots.flatMap((goal) => flattenGoalTree(goal, { includeRoot: true }));
        return flattened.filter((goal) => !goal.completed);
    }, [selectionGoals, sessionGoalsView]);

    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

    const handleUpdateNote = async (noteId, content) => {
        const note = sessionNotes.find((item) => item.id === noteId);
        await updateNote(noteId, content);
        if (note?.is_nano_goal) {
            notify.success(`Updated Nano Goal: ${content}`);
        }
    };

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
        setSidePaneModeUi('goals');
        if (isMobile) setIsMobilePaneOpen(true);
    };

    const handleAssociateActivity = async (goalIds) => {
        const activityDef = associationContext?.activityDefinition;
        if (!activityDef) return;
        const idsToAssociate = Array.isArray(goalIds) ? goalIds : [goalIds];
        try {
            await fractalApi.setActivityGoals(rootId, activityDef.id, idsToAssociate);
            queryClient.setQueryData(activitiesKey, (previous) => {
                if (!Array.isArray(previous)) return previous;
                return previous.map((activity) => (
                    activity.id === activityDef.id
                        ? { ...activity, associated_goal_ids: idsToAssociate }
                        : activity
                ));
            });
            queryClient.setQueryData(sessionGoalsViewKey, (previous) => {
                if (!previous) return previous;
                return {
                    ...previous,
                    activity_goal_ids_by_activity: {
                        ...(previous.activity_goal_ids_by_activity || {}),
                        [activityDef.id]: idsToAssociate,
                    },
                };
            });
            setAssociationContext((previous) => (
                previous
                    ? { ...previous, initialSelectedGoalIds: idsToAssociate }
                    : previous
            ));
            queryClient.invalidateQueries({ queryKey: activitiesKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            queryClient.invalidateQueries({ queryKey: fractalTreeKey });
            notify.success('Activity associated successfully');
            return true;
        } catch {
            notify.error('Failed to associate activity');
            return false;
        }
    };

    const handleGoalHierarchyChanged = () => {
        queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
        queryClient.invalidateQueries({ queryKey: sessionKey });
        queryClient.invalidateQueries({ queryKey: fractalTreeKey });
    };

    const handleGoalAssociationsChanged = () => {
        queryClient.invalidateQueries({ queryKey: activitiesKey });
        handleGoalHierarchyChanged();
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
            if (note.is_nano_goal) {
                const nanoGoalName = note.content || 'Untitled';
                notify.success(`Deleted Nano Goal: ${nanoGoalName}`);
            }
        } catch (err) {
            console.error("Failed to delete note/goal", err);
            notify.error("Failed to delete");
        }
    };

    const handleSaveSession = () => {
        notify.success('Session saved successfully');
        navigate(`/${rootId}/sessions`);
    };

    useEffect(() => {
        if (isMobile) return undefined;

        const timeoutId = window.setTimeout(() => {
            setIsMobilePaneOpen(false);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [isMobile]);

    return {
        session,
        activities,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode: setSidePaneModeUi,
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
        updateNote: handleUpdateNote,
        deleteNote: handleDeleteNote,
        refreshNotes,
        handleActivityFocus,
        handleOpenGoals,
        handleAssociateActivity,
        handleGoalHierarchyChanged,
        handleGoalAssociationsChanged,
        handleOpenActivityBuilder,
        handleActivityCreated,
        handleConfirmDelete,
        handleSaveSession
    };
}
