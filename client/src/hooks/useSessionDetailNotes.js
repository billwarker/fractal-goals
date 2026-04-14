import useSessionNotes from './useSessionNotes';

export function useSessionDetailNotes({
    rootId,
    sessionId,
    selectedActivity,
}) {
    const sessionNotesHook = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

    return {
        ...sessionNotesHook,
    };
}

export default useSessionDetailNotes;
