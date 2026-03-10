function normalizeDateValue(value) {
    if (!value) {
        return null;
    }

    return String(value).slice(0, 10);
}

export function getGoalDeadline(goal) {
    return normalizeDateValue(goal?.attributes?.deadline || goal?.deadline);
}

export function isGoalAssociatedWithBlock(goal, block) {
    const deadline = getGoalDeadline(goal);
    const startDate = normalizeDateValue(block?.start_date);
    const endDate = normalizeDateValue(block?.end_date);

    if (!deadline || !startDate || !endDate) {
        return false;
    }

    return deadline >= startDate && deadline <= endDate;
}
