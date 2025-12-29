export const calculateMetrics = (goalNode, allPracticeSessions = []) => {
    if (!goalNode) return { totalGoals: 0, completedGoals: 0, completionPercentage: 0, practiceSessionCount: 0 };

    let totalGoals = 0;
    let completedGoals = 0;
    const goalIds = new Set();

    const traverse = (node) => {
        totalGoals++;
        goalIds.add(node.id || node.attributes?.id);
        if (node.attributes?.completed) {
            completedGoals++;
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
        }
    };

    traverse(goalNode);

    // Count unique practice sessions linked to any goal in this tree
    let practiceSessionCount = 0;
    if (allPracticeSessions.length > 0) {
        practiceSessionCount = allPracticeSessions.filter(session => {
            const parentIds = session.attributes?.parent_ids || [];
            // Check if any parent of this session is in the current tree
            return parentIds.some(pid => goalIds.has(pid));
        }).length;
    }

    const completionPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    return { totalGoals, completedGoals, completionPercentage, practiceSessionCount };
};
