import { useEffect, useRef } from 'react';

import notify from '../utils/notify';

export function useSessionAchievementNotifications({
    rootId,
    sessionId,
    achievedTargetIds,
    targetAchievements,
    goalAchievements,
    sessionLoading,
    instancesLoading,
    sessionGoalsViewLoading,
}) {
    const targetNotificationsInitializedRef = useRef(false);
    const goalNotificationsInitializedRef = useRef(false);
    const prevAchievedTargetIdsRef = useRef(new Set());
    const prevCompletedIdsRef = useRef(new Set());

    useEffect(() => {
        targetNotificationsInitializedRef.current = false;
        goalNotificationsInitializedRef.current = false;
        prevAchievedTargetIdsRef.current = new Set();
        prevCompletedIdsRef.current = new Set();
    }, [rootId, sessionId]);

    useEffect(() => {
        if (!achievedTargetIds || !targetAchievements) return;
        if (sessionLoading || instancesLoading || sessionGoalsViewLoading) return;
        if (!targetNotificationsInitializedRef.current) {
            prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
            targetNotificationsInitializedRef.current = true;
            return;
        }

        const previousAchieved = prevAchievedTargetIdsRef.current;
        const newlyAchieved = [];
        for (const targetId of achievedTargetIds) {
            if (!previousAchieved.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status && !status.wasAlreadyCompleted) newlyAchieved.push(status);
            }
        }
        if (newlyAchieved.length > 0) {
            const names = newlyAchieved.map((status) => status.target.name || 'Target').join(', ');
            notify.success(`Target achieved: ${names}`, { duration: 5000 });
        }

        const newlyReverted = [];
        for (const targetId of previousAchieved) {
            if (!achievedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status) newlyReverted.push(status);
            }
        }
        if (newlyReverted.length > 0) {
            const names = newlyReverted.map((status) => status.target.name || 'Target').join(', ');
            notify.success(`Target reverted: ${names}`, { duration: 5000 });
        }

        prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
    }, [
        achievedTargetIds,
        instancesLoading,
        sessionGoalsViewLoading,
        sessionLoading,
        targetAchievements,
    ]);

    useEffect(() => {
        if (!goalAchievements) return;
        if (sessionLoading || instancesLoading || sessionGoalsViewLoading) return;

        const currentCompletedIds = new Set();
        goalAchievements.forEach((status, goalId) => {
            if (status.allAchieved) currentCompletedIds.add(goalId);
        });

        if (!goalNotificationsInitializedRef.current) {
            prevCompletedIdsRef.current = currentCompletedIds;
            goalNotificationsInitializedRef.current = true;
            return;
        }

        const previousCompletedIds = prevCompletedIdsRef.current;
        const newlyCompleted = [];
        for (const goalId of currentCompletedIds) {
            if (!previousCompletedIds.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status && !status.wasAlreadyCompleted) newlyCompleted.push(status);
            }
        }
        if (newlyCompleted.length > 0) {
            const messages = newlyCompleted.map((status) => `${status.goalType || 'Goal'} Completed: ${status.goalName}`);
            notify.success(messages.join(', '), { duration: 6000 });
        }

        const newlyUncompleted = [];
        for (const goalId of previousCompletedIds) {
            if (!currentCompletedIds.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status) newlyUncompleted.push(status);
            }
        }
        if (newlyUncompleted.length > 0) {
            const messages = newlyUncompleted.map((status) => `${status.goalType || 'Goal'} Uncompleted: ${status.goalName}`);
            notify.success(messages.join(', '), { duration: 6000 });
        }

        prevCompletedIdsRef.current = currentCompletedIds;
    }, [
        goalAchievements,
        instancesLoading,
        sessionGoalsViewLoading,
        sessionLoading,
    ]);
}

export default useSessionAchievementNotifications;
