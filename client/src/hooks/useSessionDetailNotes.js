import useSessionNotes from './useSessionNotes';

export function useSessionDetailNotes({
    rootId,
    sessionId,
}) {
    const sessionNotesHook = useSessionNotes(rootId, sessionId);

    return {
        ...sessionNotesHook,
    };
}

export default useSessionDetailNotes;
