import { parseTargets } from './goalUtils';

export function getTargetStatus(target, goal, targetAchievements, achievedTargetIds) {
    const achievement = targetAchievements?.get(target.id);
    const hasLiveTargetState = Boolean(targetAchievements);
    const shouldUsePersistedCompletion = Boolean(
        target.completed
        && (!hasLiveTargetState || !target.completed_session_id)
    );
    const isCompleted = Boolean(
        (achievement ? achievement.achieved : shouldUsePersistedCompletion)
        || achievedTargetIds?.has(target.id)
    );

    let reason = 'pending';
    if (shouldUsePersistedCompletion) reason = 'persisted_target';
    else if (achievement?.achieved) reason = 'realtime_target';

    return {
        isCompleted,
        reason,
        achievement
    };
}

export function getGoalStatus(goal, targetAchievements, achievedTargetIds) {
    const targets = parseTargets(goal);
    const targetStatuses = targets.map((target) => getTargetStatus(target, goal, targetAchievements, achievedTargetIds));
    const allTargetsCompleted = targetStatuses.length > 0 && targetStatuses.every((status) => status.isCompleted);
    const hasTargets = targets.length > 0;
    const persistedCompleted = Boolean(goal.completed || goal.attributes?.completed);
    const completed = hasTargets ? allTargetsCompleted : persistedCompleted;

    let reason = 'pending';
    if (hasTargets) {
        if (allTargetsCompleted) reason = 'targets_completed';
    } else if (persistedCompleted) {
        reason = 'goal_completed';
    }

    return {
        completed,
        reason,
        totalTargets: targets.length,
        completedTargets: targetStatuses.filter((status) => status.isCompleted).length
    };
}
