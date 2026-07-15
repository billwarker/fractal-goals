const goalLevels = [
    {
        type: 'UltimateGoal',
        shape: 'twelvePointStar',
        color: '#4f9cf9',
        secondaryColor: '#102235',
    },
    {
        type: 'LongTermGoal',
        shape: 'hexagon',
        color: '#3bc57c',
        secondaryColor: '#0f271c',
    },
    {
        type: 'MidTermGoal',
        shape: 'diamond',
        color: '#f59f4d',
        secondaryColor: '#2c1d0f',
    },
    {
        type: 'ShortTermGoal',
        shape: 'triangle',
        color: '#8b6fff',
        secondaryColor: '#181329',
    },
    {
        type: 'ImmediateGoal',
        shape: 'circle',
        color: '#ef6a6a',
        secondaryColor: '#301515',
    },
];

const levelByType = Object.fromEntries(goalLevels.map((level) => [level.type, level]));

export function collectSnapshotLevels(rootNode) {
    if (!rootNode) return [];
    const levelsByKey = new Map();
    const stack = [rootNode];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        const level = node.level || node.attributes?.level;
        const key = level?.id || level?.name;
        if (level && key && !levelsByKey.has(key)) {
            levelsByKey.set(key, {
                id: level.id,
                name: level.name,
                color: level.color,
                secondary_color: level.secondary_color,
                icon: level.icon,
                ...(node.level_characteristics || {}),
            });
        }
        const children = node.children || [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }
    return Array.from(levelsByKey.values());
}

export function getGoalIconProps(goal) {
    const goalType = goal?.attributes?.type || goal?.type || 'UltimateGoal';
    const serializedLevel = goal?.level || goal?.attributes?.level || null;
    if (serializedLevel?.icon) {
        return {
            shape: serializedLevel.icon,
            color: serializedLevel.color || levelByType[goalType]?.color || levelByType.UltimateGoal.color,
            secondaryColor: serializedLevel.secondary_color || levelByType[goalType]?.secondaryColor || levelByType.UltimateGoal.secondaryColor,
            isSmart: Boolean(goal?.attributes?.is_smart ?? goal?.is_smart),
        };
    }

    const fallbackLevel = levelByType[goalType] || levelByType.UltimateGoal;
    return {
        shape: fallbackLevel.shape,
        color: fallbackLevel.color,
        secondaryColor: fallbackLevel.secondaryColor,
        isSmart: Boolean(goal?.attributes?.is_smart ?? goal?.is_smart),
    };
}

export function findFirstGoalByType(rootNode, goalType) {
    if (!rootNode) return null;
    const stack = [rootNode];
    while (stack.length > 0) {
        const node = stack.shift();
        const nodeType = node?.attributes?.type || node?.type;
        if (nodeType === goalType) return node;
        stack.unshift(...(node?.children || []));
    }
    return null;
}
