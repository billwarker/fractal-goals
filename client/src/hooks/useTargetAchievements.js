import { useMemo } from 'react';
import { isTargetAchieved } from '../utils/targetUtils';

/**
 * Hook for real-time target achievement detection during a session
 * 
 * This provides immediate visual feedback when targets are hit,
 * WITHOUT persisting the achievement status to the backend.
 * Actual persistence happens when the session is completed.
 * 
 * @param {Array} activityInstances - Current activity instances with their metrics
 * @param {Array} parentGoals - Goals associated with the session (with targets)
 * @returns {Object} Achievement status for real-time UI feedback
 */
export function useTargetAchievements(activityInstances, parentGoals) {
    // Build achievement status
    const achievementStatus = useMemo(() => {
        // Map of target_id -> achievement status
        const targetAchievements = new Map();
        // Map of goal_id -> array of achieved target ids
        const goalAchievements = new Map();
        // Set of achieved target IDs for quick lookup
        const achievedTargetIds = new Set();
        // Total counts
        let totalTargets = 0;
        let totalAchieved = 0;

        if (!activityInstances || !parentGoals) {
            return {
                targetAchievements,
                goalAchievements,
                achievedTargetIds,
                totalTargets: 0,
                totalAchieved: 0,
                allTargetsAchieved: false
            };
        }

        // Build map of activity instances by activity_id for quick lookup
        const instancesByActivity = {};
        for (const inst of activityInstances) {
            const activityId = inst.activity_definition_id || inst.activity_id;
            if (!instancesByActivity[activityId]) {
                instancesByActivity[activityId] = [];
            }
            instancesByActivity[activityId].push(inst);
        }

        // Check each goal's targets
        for (const goal of parentGoals) {
            const targets = parseTargets(goal);
            const achievedForGoal = [];

            for (const target of targets) {
                totalTargets++;

                // Check if target was already marked as completed (from backend)
                if (target.completed) {
                    achievedTargetIds.add(target.id);
                    achievedForGoal.push(target.id);
                    totalAchieved++;
                    targetAchievements.set(target.id, {
                        achieved: true,
                        wasAlreadyCompleted: true,
                        target,
                        goalId: goal.id,
                        goalName: goal.name
                    });
                    continue;
                }

                // Check if any activity instance in this session achieves this target
                const activityId = target.activity_id;
                const instances = instancesByActivity[activityId] || [];

                let achieved = false;
                for (const inst of instances) {
                    if (checkTargetAchieved(target, inst)) {
                        achieved = true;
                        break;
                    }
                }

                if (achieved) {
                    achievedTargetIds.add(target.id);
                    achievedForGoal.push(target.id);
                    totalAchieved++;
                }

                targetAchievements.set(target.id, {
                    achieved,
                    wasAlreadyCompleted: false,
                    target,
                    goalId: goal.id,
                    goalName: goal.name
                });
            }

            goalAchievements.set(goal.id, {
                goalName: goal.name,
                totalTargets: targets.length,
                achievedTargets: achievedForGoal.length,
                achievedTargetIds: achievedForGoal,
                allAchieved: targets.length > 0 && achievedForGoal.length === targets.length,
                wasAlreadyCompleted: !!goal.completed
            });
        }

        return {
            targetAchievements,
            goalAchievements,
            achievedTargetIds,
            totalTargets,
            totalAchieved,
            allTargetsAchieved: totalTargets > 0 && totalAchieved === totalTargets
        };
    }, [activityInstances, parentGoals]);

    return achievementStatus;
}

/**
 * Parse targets from a goal object
 */
function parseTargets(goal) {
    let targets = [];

    // Check attributes first (common structure)
    if (goal.attributes?.targets) {
        try {
            targets = typeof goal.attributes.targets === 'string'
                ? JSON.parse(goal.attributes.targets)
                : goal.attributes.targets;
        } catch (e) {
            targets = [];
        }
    } else if (goal.targets) {
        try {
            targets = typeof goal.targets === 'string'
                ? JSON.parse(goal.targets)
                : goal.targets;
        } catch (e) {
            targets = [];
        }
    }

    return Array.isArray(targets) ? targets : [];
}

/**
 * Check if a target is achieved by an activity instance (inline version)
 * This mirrors the logic in targetUtils.js but works with our instance data structure
 */
function checkTargetAchieved(target, instance) {
    if (!target || !instance || !instance.completed) return false;

    const targetMetrics = target.metrics || [];
    if (targetMetrics.length === 0) return false;

    // Check activity ID matches
    const instanceActivityId = instance.activity_definition_id || instance.activity_id;
    if (target.activity_id !== instanceActivityId) return false;

    // For activities with sets, check if ANY set achieves all target metrics
    const sets = instance.sets || [];
    if (sets.length > 0) {
        return sets.some(set => {
            const setMetrics = set.metrics || [];
            return checkMetricsMeetTarget(targetMetrics, setMetrics);
        });
    }

    // For activities without sets, check flat metrics
    const instanceMetrics = instance.metrics || [];
    return checkMetricsMeetTarget(targetMetrics, instanceMetrics);
}

/**
 * Check if actual metrics meet or exceed all target metrics
 */
function checkMetricsMeetTarget(targetMetrics, actualMetrics) {
    if (!targetMetrics || targetMetrics.length === 0) return false;

    // Build a map of actual metric values by metric_id
    const actualMap = {};
    for (const m of actualMetrics) {
        const metricId = m.metric_id || m.metric_definition_id;
        if (metricId && m.value != null) {
            actualMap[metricId] = parseFloat(m.value);
        }
    }

    // Check all target metrics are met
    return targetMetrics.every(tm => {
        const metricId = tm.metric_id;
        const targetValue = tm.value;

        if (!metricId || targetValue == null) return true; // Skip invalid metrics

        const actualValue = actualMap[metricId];
        if (actualValue == null) return false; // Missing metric

        return actualValue >= parseFloat(targetValue); // Met or exceeded
    });
}

export default useTargetAchievements;
