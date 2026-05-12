import { useMemo } from 'react';

import { useActiveSessionActions, useActiveSessionData } from '../contexts/ActiveSessionContext';

export function useSessionSidePaneViewModel({
    selectedActivity,
    onNoteAdded,
    onGoalClick,
    onGoalCreated,
    notes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote,
    pinNote,
    unpinNote,
    onOptions,
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
    const { toggleSessionComplete } = useActiveSessionActions();

    const sessionActivityDefs = useMemo(() => {
        if (!activityInstances || !activityDefinitions) return [];
        const definitionIds = new Set(activityInstances.map((instance) => instance.activity_definition_id));
        return activityDefinitions.filter((definition) => definitionIds.has(definition.id));
    }, [activityDefinitions, activityInstances]);

    return useMemo(() => ({
        mode,
        onModeChange,
        details: {
            isCompleted: Boolean(session?.attributes?.completed),
            onToggleComplete: toggleSessionComplete,
            onOptions,
        },
        goals: {
            selectedActivity,
            onGoalClick,
            onGoalCreated,
        },
        timeline: {
            rootId,
            sessionId,
            selectedActivity,
            sessionActivityDefs,
            onNoteAdded,
            notes,
            previousSessionNotes,
            addNote,
            updateNote,
            deleteNote,
            pinNote,
            unpinNote,
        },
    }), [
        activityDefinitions,
        activityInstances,
        addNote,
        deleteNote,
        mode,
        notes,
        onGoalClick,
        onGoalCreated,
        onModeChange,
        onNoteAdded,
        onOptions,
        previousSessionNotes,
        pinNote,
        rootId,
        selectedActivity,
        session?.attributes?.completed,
        session?.is_paused,
        sessionActivityDefs,
        sessionId,
        toggleSessionComplete,
        unpinNote,
        updateNote,
    ]);
}

export default useSessionSidePaneViewModel;
