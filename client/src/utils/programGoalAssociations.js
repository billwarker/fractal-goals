function normalizeDateValue(value) {
    if (!value) {
        return null;
    }

    return String(value).slice(0, 10);
}

export function getGoalDeadline(goal) {
    return normalizeDateValue(goal?.attributes?.deadline || goal?.deadline);
}
