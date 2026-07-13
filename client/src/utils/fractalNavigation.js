export function getFractalSwitchPath(pathname, nextRootId) {
    const pathParts = pathname.split('/').filter(Boolean);
    const section = pathParts[1];
    const knownSection = {
        analytics: 'analytics',
        'create-session': 'create-session',
        goals: 'goals',
        logs: 'logs',
        notes: 'notes',
        programs: 'programs',
        session: 'sessions',
        sessions: 'sessions',
    }[section] || 'goals';

    return `/${nextRootId}/${knownSection}`;
}

export function getFractalDisplay(fractal, rootGoal, goalLevels) {
    const level = fractal?.display_level || null;
    const type = fractal?.type || rootGoal?.attributes?.type || rootGoal?.type;
    const isSmart = Boolean(
        fractal?.is_smart
        ?? fractal?.attributes?.is_smart
        ?? rootGoal?.attributes?.is_smart
        ?? rootGoal?.is_smart
    );

    return {
        name: fractal?.name || rootGoal?.name || 'Fractal Goals',
        shape: level?.icon || (type ? goalLevels.getGoalIcon(type) : null) || 'circle',
        color: level?.color || (type ? goalLevels.getGoalColor(type) : null),
        secondaryColor: level?.secondary_color || (type ? goalLevels.getGoalSecondaryColor(type) : null),
        isSmart,
        type,
    };
}
