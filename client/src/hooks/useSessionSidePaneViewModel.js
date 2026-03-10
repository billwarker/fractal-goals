import { useMemo } from 'react';

import { useActiveSessionActions, useActiveSessionData } from '../contexts/ActiveSessionContext';

export function useSessionSidePaneViewModel({
    selectedActivity,
    selectedSetIndex,
    onNoteAdded,
    onGoalClick,
    onGoalCreated,
    notes,
    previousNotes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote,
    onSave,
    onDelete,
    onOpenGoals,
    mode,
    onModeChange,
}) {
    const {
        rootId,
        sessionId,
        session,
        activityInstances,
        activities: activityDefinitions,
    } = useActiveSessionData();
    const {
        toggleSessionComplete,
        pauseSession,
        resumeSession,
    } = useActiveSessionActions();

    const sessionActivityDefs = useMemo(() => {
        if (!activityInstances || !activityDefinitions) return [];
        const definitionIds = new Set(activityInstances.map((instance) => instance.activity_definition_id));
        return activityDefinitions.filter((definition) => definitionIds.has(definition.id));
    }, [activityDefinitions, activityInstances]);

    const selectedActivityDef = useMemo(() => {
        if (!selectedActivity || !activityDefinitions) return null;
        return activityDefinitions.find((definition) => definition.id === selectedActivity.activity_definition_id) || null;
    }, [activityDefinitions, selectedActivity]);

    return useMemo(() => ({
        mode,
        onModeChange,
        details: {
            isCompleted: Boolean(session?.attributes?.completed),
            isPaused: Boolean(session?.is_paused),
            onToggleComplete: toggleSessionComplete,
            onPauseResume: () => (session?.is_paused ? resumeSession() : pauseSession()),
            onSave,
            onDelete,
            notesPanelProps: {
                rootId,
                sessionId,
                selectedActivity,
                selectedActivityDef,
                selectedSetIndex,
                onNoteAdded,
                activityInstances,
                activityDefinitions,
                notes,
                previousNotes,
                previousSessionNotes,
                addNote,
                updateNote,
                deleteNote,
            },
        },
        goals: {
            selectedActivity,
            onGoalClick,
            onGoalCreated,
            onOpenGoals,
        },
        history: {
            rootId,
            sessionId,
            selectedActivity,
            sessionActivityDefs,
        },
    }), [
        activityDefinitions,
        activityInstances,
        addNote,
        deleteNote,
        mode,
        notes,
        onDelete,
        onGoalClick,
        onGoalCreated,
        onModeChange,
        onNoteAdded,
        onOpenGoals,
        onSave,
        pauseSession,
        previousNotes,
        previousSessionNotes,
        resumeSession,
        rootId,
        selectedActivity,
        selectedActivityDef,
        selectedSetIndex,
        session?.attributes?.completed,
        session?.is_paused,
        sessionActivityDefs,
        sessionId,
        toggleSessionComplete,
        updateNote,
    ]);
}

export default useSessionSidePaneViewModel;
