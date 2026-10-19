import { useEffect, useMemo, useRef } from 'react';

import notify from '../utils/notify';
import { flattenSessionGoalsViewGoals } from '../utils/goalNodeModel';
import { getTypeDisplayName } from '../utils/goalHelpers';

/**
 * Announce goals this session completes (or un-completes) on their own.
 *
 * Completion is decided on the server; this watches the derived condition progress for the
 * session's goals and notifies on transitions after the first load, never for goals that were
 * already complete when the session opened.
 */
export function useSessionAchievementNotifications({
    sessionId,
    conditionProgressByGoalId,
    sessionGoalsView,
    sessionLoading,
    instancesLoading,
    sessionGoalsViewLoading,
}) {
    const initializedRef = useRef(false);
    const previousCompletedRef = useRef(new Set());
    const goalsById = useMemo(() => new Map(
        flattenSessionGoalsViewGoals(sessionGoalsView).map((goal) => [String(goal.id), goal]),
    ), [sessionGoalsView]);

    useEffect(() => {
        initializedRef.current = false;
        previousCompletedRef.current = new Set();
    }, [sessionId]);

    useEffect(() => {
        if (!conditionProgressByGoalId) return;
        if (sessionLoading || instancesLoading || sessionGoalsViewLoading) return;
        const progressEntries = Object.entries(conditionProgressByGoalId);
        if (progressEntries.length === 0) return;

        const currentCompleted = new Set(
            progressEntries.filter(([, progress]) => progress?.completed).map(([goalId]) => goalId),
        );
        if (!initializedRef.current) {
            previousCompletedRef.current = currentCompleted;
            initializedRef.current = true;
            return;
        }

        const label = (goalId) => {
            const goal = goalsById.get(goalId);
            const level = goal?.type ? getTypeDisplayName(goal.type) : 'Goal';
            return `${level}: ${goal?.name || 'Goal'}`;
        };
        const completed = [...currentCompleted].filter((goalId) => !previousCompletedRef.current.has(goalId));
        const reverted = [...previousCompletedRef.current].filter((goalId) => (
            !currentCompleted.has(goalId) && conditionProgressByGoalId[goalId]
        ));
        if (completed.length > 0) {
            notify.success(`Completed — ${completed.map(label).join(', ')}`, { duration: 6000 });
        }
        if (reverted.length > 0) {
            notify.success(`No longer complete — ${reverted.map(label).join(', ')}`, { duration: 6000 });
        }
        previousCompletedRef.current = currentCompleted;
    }, [conditionProgressByGoalId, goalsById, instancesLoading, sessionGoalsViewLoading, sessionLoading]);
}

export default useSessionAchievementNotifications;
