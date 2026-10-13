export function summarizeFilteredGoals(filteredGoalAnalyticsGoals, avgGoalAgeDays) {
    const completedGoals = filteredGoalAnalyticsGoals.filter((goal) => goal.completed);
    const completionTimes = completedGoals.map((goal) => {
        const created = goal.created_at ? new Date(goal.created_at) : null;
        const completed = goal.completed_at ? new Date(goal.completed_at) : null;
        if (!created || !completed || Number.isNaN(created.getTime()) || Number.isNaN(completed.getTime())) {
            return null;
        }
        return Math.max(0, Math.round((completed - created) / 86400000));
    }).filter((value) => value != null);
    const durations = completedGoals.map((goal) => goal.total_duration_seconds || 0).filter((value) => value > 0);

    return {
        completed_goals: completedGoals.length,
        completion_rate: filteredGoalAnalyticsGoals.length > 0
            ? (completedGoals.length / filteredGoalAnalyticsGoals.length) * 100
            : 0,
        avg_goal_age_days: avgGoalAgeDays || 0,
        avg_time_to_completion_days: completionTimes.length
            ? completionTimes.reduce((sum, value) => sum + value, 0) / completionTimes.length
            : 0,
        avg_duration_to_completion_seconds: durations.length
            ? durations.reduce((sum, value) => sum + value, 0) / durations.length
            : 0,
    };
}
