/**
 * Calculate metrics for goal tree visualization
 * 
 * NOTE: Sessions are now separate from goals and not counted here.
 */
export const calculateMetrics = (goalNode) => {
    if (!goalNode) {
        return {
            totalGoals: 0,
            completedGoals: 0,
            goalCompletionPercentage: 0,
            totalDeadlines: 0,
            missedDeadlines: 0,
            deadlineMissedPercentage: 0,
        };
    }

    let totalGoals = 0;
    let completedGoals = 0;
    let totalDeadlines = 0;
    let missedDeadlines = 0;

    const now = new Date();

    const traverse = (node) => {
        totalGoals++;
        const isCompleted = Boolean(node.completed ?? node.attributes?.completed);

        if (isCompleted) {
            completedGoals++;
        }

        // Check for deadline
        const deadline = node.deadline ?? node.attributes?.deadline;
        if (deadline) {
            totalDeadlines++;
            const deadlineDate = new Date(deadline);
            // Missed = has deadline in the past AND not completed
            if (deadlineDate < now && !isCompleted) {
                missedDeadlines++;
            }
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
        }
    };

    traverse(goalNode);

    const goalCompletionPercentage = totalGoals > 0
        ? Math.round((completedGoals / totalGoals) * 100)
        : 0;

    const deadlineMissedPercentage = totalDeadlines > 0
        ? Math.round((missedDeadlines / totalDeadlines) * 100)
        : 0;

    return {
        totalGoals,
        completedGoals,
        goalCompletionPercentage,
        // Legacy support
        completionPercentage: goalCompletionPercentage,
        totalDeadlines,
        missedDeadlines,
        deadlineMissedPercentage
    };
};
