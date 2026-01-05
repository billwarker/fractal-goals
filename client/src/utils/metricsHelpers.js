/**
 * Calculate metrics for goal tree visualization
 * 
 * NOTE: Sessions are now separate from goals and not counted here.
 */
export const calculateMetrics = (goalNode) => {
    if (!goalNode) return { totalGoals: 0, completedGoals: 0, completionPercentage: 0 };

    let totalGoals = 0;
    let completedGoals = 0;

    const traverse = (node) => {
        totalGoals++;
        if (node.attributes?.completed) {
            completedGoals++;
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
        }
    };

    traverse(goalNode);

    const completionPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    return { totalGoals, completedGoals, completionPercentage };
};
