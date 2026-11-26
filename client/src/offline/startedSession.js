import { queryKeys } from '../hooks/queryKeys';

const orElse = (value) => (previous) => previous ?? value;

/** A session started on this device, until the server has it. */
export function showStartedSession(queryClient, { meta }) {
    // Only what is missing: later changes to it are applied over this, and are kept.
    const { rootId, sessionId, session, instances, runs, userId } = meta;
    queryClient.setQueryData(queryKeys.session(rootId, sessionId), orElse(session));
    queryClient.setQueryData(queryKeys.sessionActivities(rootId, sessionId), (previous) => {
        const known = new Set((previous || []).map(({ id }) => id));
        const added = instances.filter(({ id }) => !known.has(id));
        return previous && added.length === 0 ? previous : [...(previous || []), ...added];
    });
    queryClient.setQueryData(queryKeys.sessionCircuitRuns(rootId, sessionId), (previous) => (previous?.length ? previous : runs));
    queryClient.setQueryData(queryKeys.sessionNotes(rootId, sessionId), orElse([]));
    queryClient.setQueryData(queryKeys.sessionGoalsView(rootId, sessionId), (previous) => previous ?? null);
    // Create Session and the header lead back to it, as to any session in progress.
    queryClient.setQueryData(queryKeys.activeSession(userId, rootId), orElse(session));
}
