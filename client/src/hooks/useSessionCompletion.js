import { useCallback } from 'react';

import { logError } from '../utils/logger';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';


export function useSessionCompletion({
    rootId,
    sessionId,
    session,
    sessionActivitiesKey,
    queryClient,
    updateSession,
}) {
    return useCallback(async () => {
        if (!session) return;
        const completed = typeof session.completed === 'boolean'
            ? session.completed
            : Boolean(session.attributes?.completed);
        const nextCompleted = !completed;
        const updatePayload = { completed: nextCompleted };
        if (nextCompleted) updatePayload.session_end = new Date().toISOString();

        try {
            await updateSession(updatePayload);
            if (nextCompleted) {
                queryClient.setQueryData(sessionActivitiesKey, (previous = []) => (
                    Array.isArray(previous)
                        ? previous.map((instance) => ({
                            ...instance,
                            completed: instance.completed || Boolean(instance.time_start),
                        }))
                        : previous
                ));
                const circuitsKey = queryKeys.sessionCircuitRuns(rootId, sessionId);
                queryClient.setQueryData(circuitsKey, (previous = []) => (
                    Array.isArray(previous)
                        ? previous.map((run) => ({
                            ...run,
                            status: ['active', 'paused'].includes(run.status)
                                ? 'completed'
                                : run.status,
                        }))
                        : previous
                ));
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: sessionActivitiesKey }),
                    queryClient.invalidateQueries({ queryKey: circuitsKey }),
                ]);
                queryClient.invalidateQueries({
                    queryKey: queryKeys.sessionProgressSummary(sessionId),
                });
            }
            notify.success(nextCompleted ? 'Session completed!' : 'Session marked as incomplete');
        } catch (error) {
            logError('Failed to toggle session completion', error);
            const reason = error?.response?.data?.error || error?.message || 'Unknown error';
            notify.error(`Failed to update session completion: ${reason}`);
        }
    }, [queryClient, rootId, session, sessionActivitiesKey, sessionId, updateSession]);
}
