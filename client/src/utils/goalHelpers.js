/**
 * Goal Helpers - Utilities for goal hierarchy management
 *
 * IMPORTANT: Sessions are NO LONGER part of the goal hierarchy.
 * Hierarchy is now: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → ImmediateGoal → MicroGoal → NanoGoal
 *
 * Macro goals (Ultimate through Immediate) support flexible hierarchy: a child may be
 * any lower-rank macro level, not just the immediately adjacent one. Level ordering is
 * enforced by rank on the backend. The execution tier (Immediate → Micro → Nano) remains
 * strictly enforced.
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

const EXECUTION_TYPES = new Set(['MicroGoal', 'NanoGoal']);
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
 * For ImmediateGoal: only MicroGoal (execution tier entry point).
 * For MicroGoal: only NanoGoal.
 * For NanoGoal: empty (leaf node).
 *
 * @param {string} parentType - canonical goal type string
 * @returns {string[]} - ordered list of valid child type strings (closest first)
 */
export const getValidChildTypes = (parentType) => {
    if (parentType === 'NanoGoal') return [];
    if (parentType === 'MicroGoal') return ['NanoGoal'];
    if (parentType === 'ImmediateGoal') return ['MicroGoal'];

    const parentIndex = MACRO_TYPES_BY_RANK.indexOf(parentType);
    if (parentIndex === -1) return [];

    // Return all macro types with a higher rank index (lower in the tree),
    // excluding ImmediateGoal's execution-tier children — those are entered via ImmediateGoal only.
    // ImmediateGoal is included as a valid macro child.
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
