/**
 * Utility functions for checking target achievement
 */

/**
 * Check if a target was achieved in an activity instance
 * @param {Object} target - The target object with metrics
 * @param {Object} activityInstance - The activity instance (exercise) with metrics or sets
 * @returns {boolean} - True if target was achieved
 */
export const isTargetAchieved = (target, activityInstance) => {
    if (!target || !activityInstance) return false;

    // Target must have metrics to compare
    if (!target.metrics || target.metrics.length === 0) return false;

    // Check if activity instance has the same activity_id
    if (target.activity_id !== activityInstance.activity_id) return false;

    // For activities with sets, check if ANY set achieved all target metrics
    if (activityInstance.has_sets && activityInstance.sets && activityInstance.sets.length > 0) {
        return activityInstance.sets.some(set => {
            if (!set.metrics) return false;

            // All target metrics must be met or exceeded in this set
            return target.metrics.every(targetMetric => {
                const setMetric = set.metrics.find(m => m.metric_id === targetMetric.metric_id);
                if (!setMetric || setMetric.value == null) return false;

                // Check if the set metric value meets or exceeds the target
                return setMetric.value >= targetMetric.value;
            });
        });
    }

    // For activities without sets, check if the single metrics achieve the target
    if (activityInstance.has_metrics && activityInstance.metrics) {
        return target.metrics.every(targetMetric => {
            const instanceMetric = activityInstance.metrics.find(m => m.metric_id === targetMetric.metric_id);
            if (!instanceMetric || instanceMetric.value == null) return false;

            // Check if the instance metric value meets or exceeds the target
            return instanceMetric.value >= targetMetric.value;
        });
    }

    return false;
};

/**
 * Get all achieved targets for a practice session
 * @param {Object} session - The practice session object
 * @param {Array} goals - Array of parent goal objects with targets
 * @returns {Array} - Array of achieved target objects with goal info
 */
export const getAchievedTargetsForSession = (session, goals) => {
    const achievedTargets = [];

    if (!session || !goals || goals.length === 0) return achievedTargets;

    const sessionData = session.attributes?.session_data;
    if (!sessionData || !sessionData.sections) return achievedTargets;

    // Collect all activity instances from all sections
    const activityInstances = [];
    sessionData.sections.forEach(section => {
        if (section.exercises) {
            section.exercises.forEach(exercise => {
                if (exercise.type === 'activity' && exercise.instance_id) {
                    activityInstances.push(exercise);
                }
            });
        }
    });

    // Check each goal's targets against activity instances
    goals.forEach(goal => {
        const targets = goal.attributes?.targets || [];
        targets.forEach(target => {
            // Check if this target was achieved in any activity instance
            const achieved = activityInstances.some(instance =>
                isTargetAchieved(target, instance)
            );

            if (achieved) {
                achievedTargets.push({
                    target,
                    goalId: goal.id,
                    goalName: goal.name
                });
            }
        });
    });

    return achievedTargets;
};
