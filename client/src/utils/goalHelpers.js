export const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'PracticeSession',
        'PracticeSession': 'ImmediateGoal',
        'ImmediateGoal': 'MicroGoal',
        'MicroGoal': 'NanoGoal',
        'NanoGoal': null
    };
    return map[parentType];
};

export const getTypeDisplayName = (type) => {
    const names = {
        'UltimateGoal': 'Ultimate Goal',
        'LongTermGoal': 'Long Term Goal',
        'MidTermGoal': 'Mid Term Goal',
        'ShortTermGoal': 'Short Term Goal',
        'PracticeSession': 'Practice Session',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal'
    };
    return names[type] || type;
};

export const calculateGoalAge = (createdAt) => {
    if (!createdAt) return null;

    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= 365) {
        return `${(diffDays / 365).toFixed(1)}y`;
    } else if (diffDays >= 30) {
        return `${(diffDays / 30.44).toFixed(1)}mo`;
    } else if (diffDays > 7) {
        return `${(diffDays / 7).toFixed(1)}w`;
    } else {
        return `${Math.floor(diffDays)}d`;
    }
};

export const findGoalById = (node, id) => {
    if (!node) return null;
    if ((node.attributes?.id || node.id) === id) return node;

    if (node.children) {
        for (let child of node.children) {
            const found = findGoalById(child, id);
            if (found) return found;
        }
    }
    return null;
};

export const collectShortTermGoals = (node, collected = []) => {
    if (!node) return collected;
    const type = node.attributes?.type || node.type;
    if (type === 'ShortTermGoal') {
        collected.push({
            id: node.attributes?.id || node.id,
            name: node.name
        });
    }
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => collectShortTermGoals(child, collected));
    }
    return collected;
};
