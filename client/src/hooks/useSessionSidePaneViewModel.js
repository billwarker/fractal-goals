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
    targetModal = null,
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
            sessionId,
            isCompleted: Boolean(session?.attributes?.completed),
            onToggleComplete: toggleSessionComplete,
            onOptions,
            onNoteAdded,
            notes,
            previousSessionNotes,
            addNote,
            updateNote,
            deleteNote,
            pinNote,
            unpinNote,
        },
        goals: {
            selectedActivity,
            onGoalClick,
            onGoalCreated,
            targetModal,
        },
        timeline: {
            rootId,
            sessionId,
            selectedActivity,
            sessionActivityDefs,
        },
    }), [
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
        sessionActivityDefs,
        sessionId,
        targetModal,
        toggleSessionComplete,
        unpinNote,
        updateNote,
    ]);
}

export default useSessionSidePaneViewModel;
