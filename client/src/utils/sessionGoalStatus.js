import { parseTargets } from './goalUtils';

export function getTargetStatus(target, goal, targetAchievements, achievedTargetIds) {
    const achievement = targetAchievements?.get(target.id);
    const isCompleted = Boolean(
        (achievement ? achievement.achieved : target.completed)
        || achievedTargetIds?.has(target.id)
        || goal?.completed
    );

    let reason = 'pending';
    if (goal?.completed) reason = 'goal_completed';
    else if (target.completed) reason = 'persisted_target';
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
    const completed = Boolean(goal.completed || goal.attributes?.completed || allTargetsCompleted);

    let reason = 'pending';
    if (goal.completed || goal.attributes?.completed) reason = 'goal_completed';
    else if (allTargetsCompleted) reason = 'targets_completed';

    return {
        completed,
        reason,
        totalTargets: targets.length,
        completedTargets: targetStatuses.filter((status) => status.isCompleted).length
    };
}
