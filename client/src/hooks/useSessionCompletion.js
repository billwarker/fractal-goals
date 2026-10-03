import { useCallback } from 'react';

import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateValue } from '../utils/dateUtils';
import { logError } from '../utils/logger';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import { getSessionPauseState } from './useSessionDuration';


export function useSessionCompletion({
    rootId,
    sessionId,
    session,
    sessionActivitiesKey,
    queryClient,
    updateSession,
}) {
    const { timezone } = useTimezone();

    return useCallback(async () => {
        if (!session) return;
        const completed = typeof session.completed === 'boolean'
            ? session.completed
            : Boolean(session.attributes?.completed);
        const nextCompleted = !completed;
        // The server owns the end boundary: a paused session ends at its pause.
        const { isPaused, lastPausedAt } = getSessionPauseState(session);
        const completingWhilePaused = nextCompleted && isPaused;

        try {
            const response = await updateSession({ completed: nextCompleted });
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
            if (completingWhilePaused) {
                const endedAt = response?.data?.session_end || lastPausedAt;
                const endedAtLabel = formatDateValue(endedAt, 'h:mm A', timezone);
                notify.success(`Session completed — ended at ${endedAtLabel} when paused`);
            } else {
                notify.success(nextCompleted ? 'Session completed!' : 'Session marked as incomplete');
            }
        } catch (error) {
            logError('Failed to toggle session completion', error);
            const reason = error?.response?.data?.error || error?.message || 'Unknown error';
            notify.error(`Failed to update session completion: ${reason}`);
        }
    }, [queryClient, rootId, session, sessionActivitiesKey, sessionId, timezone, updateSession]);
}
