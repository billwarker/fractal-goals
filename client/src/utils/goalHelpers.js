/**
 * Goal Helpers - Utilities for goal hierarchy management
 *
 * IMPORTANT: Sessions are NO LONGER part of the goal hierarchy.
 * Hierarchy is: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → ImmediateGoal
 *
 * Macro goals (Ultimate through Immediate) support flexible hierarchy: a child may be
 * any lower-rank macro level, not just the immediately adjacent one. Level ordering is
 * enforced by rank on the backend.
 */

import {
    getGoalNodeChildren,
    getGoalNodeId,
    getGoalNodeName,
    getGoalNodeParentId,
    getGoalNodeType,
} from './goalNodeModel';

// Canonical type key derived from a GoalLevel name (e.g. "Mid Term Goal" → "MidTermGoal")
const levelNameToType = (name) => name.replace(/\s+/g, '');

const MACRO_TYPES_BY_RANK = [
    'UltimateGoal',   // rank 0
    'LongTermGoal',   // rank 1
    'MidTermGoal',    // rank 2
    'ShortTermGoal',  // rank 3
    'ImmediateGoal',  // rank 4
];

/**
 * Returns all valid child types for a given parent type.
 *
 * For macro goals: any lower-rank macro level (flexible hierarchy).
 * For ImmediateGoal: empty (leaf node — execution tier removed).
 *
 * @param {string} parentType - canonical goal type string
 * @returns {string[]} - ordered list of valid child type strings (closest first)
 */
export const getValidChildTypes = (parentType) => {
    const parentIndex = MACRO_TYPES_BY_RANK.indexOf(parentType);
    if (parentIndex === -1) return [];

    return MACRO_TYPES_BY_RANK.slice(parentIndex + 1);
};

/**
 * Returns the single default child type (adjacent next level).
 * Kept for backward-compat with callsites that only need one type.
 * @deprecated Prefer getValidChildTypes where multiple levels are possible.
 */
export const getChildType = (parentType) => {
    const valid = getValidChildTypes(parentType);
    return valid.length > 0 ? valid[0] : null;
};

export const isAboveShortTermGoal = (type) => {
    const levels = {
        'UltimateGoal': 1,
        'LongTermGoal': 2,
        'MidTermGoal': 3,
        'ShortTermGoal': 4,
        'ImmediateGoal': 5,
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
    if (getGoalNodeId(node) === id) return node;

    const children = getGoalNodeChildren(node);
    if (children.length > 0) {
        for (const child of children) {
            const found = findGoalById(child, id);
            if (found) return found;
        }
    }
    return null;
};

export const collectShortTermGoals = (node, collected = []) => {
    if (!node) return collected;
    const type = getGoalNodeType(node);
    if (type === 'ShortTermGoal') {
        collected.push({
            id: getGoalNodeId(node),
            name: getGoalNodeName(node)
        });
    }
    const children = getGoalNodeChildren(node);
    if (children.length > 0) {
        children.forEach(child => collectShortTermGoals(child, collected));
    }
    return collected;
};

export const collectImmediateGoals = (node, collected = []) => {
    if (!node) return collected;
    const type = getGoalNodeType(node);
    if (type === 'ImmediateGoal') {
        collected.push({
            id: getGoalNodeId(node),
            name: getGoalNodeName(node),
            parentId: getGoalNodeParentId(node)
        });
    }
    const children = getGoalNodeChildren(node);
    if (children.length > 0) {
        children.forEach(child => collectImmediateGoals(child, collected));
    }
    return collected;
};

export const flattenGoals = (nodes, result = []) => {
    if (!nodes) return result;
    nodes.forEach(node => {
        if (!node) return;
        result.push(node);
        const children = getGoalNodeChildren(node);
        if (children.length > 0) {
            flattenGoals(children, result);
        }
    });
    return result;
};
