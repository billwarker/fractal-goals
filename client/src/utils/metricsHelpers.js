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
            totalTargets: 0,
            completedTargets: 0,
            targetCompletionPercentage: 0
        };
    }

    let totalGoals = 0;
    let completedGoals = 0;
    let totalDeadlines = 0;
    let missedDeadlines = 0;
    let totalTargets = 0;
    let completedTargets = 0;

    const now = new Date();

    const traverse = (node) => {
        totalGoals++;
        const isCompleted = node.attributes?.completed || false;

        if (isCompleted) {
            completedGoals++;
        }

        // Check for deadline
        const deadline = node.attributes?.deadline;
        if (deadline) {
            totalDeadlines++;
            const deadlineDate = new Date(deadline);
            // Missed = has deadline in the past AND not completed
            if (deadlineDate < now && !isCompleted) {
                missedDeadlines++;
            }
        }

        // Count targets
        const targets = node.attributes?.targets || [];
        if (Array.isArray(targets)) {
            targets.forEach(target => {
                totalTargets++;
                if (target.completed || target.achieved) {
                    completedTargets++;
                }
            });
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

    const targetCompletionPercentage = totalTargets > 0
        ? Math.round((completedTargets / totalTargets) * 100)
        : 0;

    return {
        totalGoals,
        completedGoals,
        goalCompletionPercentage,
        // Legacy support
        completionPercentage: goalCompletionPercentage,
        totalDeadlines,
        missedDeadlines,
        deadlineMissedPercentage,
        totalTargets,
        completedTargets,
        targetCompletionPercentage
    };
};
