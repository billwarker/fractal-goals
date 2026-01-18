/**
 * Goal Helpers - Utilities for goal hierarchy management
 * 
 * IMPORTANT: Sessions are NO LONGER part of the goal hierarchy.
 * Hierarchy is now: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → ImmediateGoal → MicroGoal → NanoGoal
 */

export const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'ImmediateGoal',  // Changed: was PracticeSession
        'ImmediateGoal': 'MicroGoal',
        'MicroGoal': 'NanoGoal',
        'NanoGoal': null
    };
    return map[parentType];
};

export const isAboveShortTermGoal = (type) => {
    const levels = {
        'UltimateGoal': 1,
        'LongTermGoal': 2,
        'MidTermGoal': 3,
        'ShortTermGoal': 4,
        'ImmediateGoal': 5,
        'MicroGoal': 6,
        'NanoGoal': 7
    };
    return levels[type] < 4;
};

export const getTypeDisplayName = (type) => {
    const names = {
        'UltimateGoal': 'Ultimate Goal',
        'LongTermGoal': 'Long Term Goal',
        'MidTermGoal': 'Mid Term Goal',
        'ShortTermGoal': 'Short Term Goal',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal',
        'Session': 'Session'  // For display purposes only
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

export const collectImmediateGoals = (node, collected = []) => {
    if (!node) return collected;
    const type = node.attributes?.type || node.type;
    if (type === 'ImmediateGoal') {
        collected.push({
            id: node.attributes?.id || node.id,
            name: node.name,
            parentId: node.attributes?.parent_id || node.parent_id
        });
    }
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => collectImmediateGoals(child, collected));
    }
    return collected;
};
