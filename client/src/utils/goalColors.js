/**
 * Cosmic Color Palette for Goal Types
 * Centralized color definitions for consistent theming across the app
 */

export const GOAL_COLORS = {
    'UltimateGoal': 'var(--color-ultimate)',
    'LongTermGoal': 'var(--color-long-term)',
    'MidTermGoal': 'var(--color-mid-term)',
    'ShortTermGoal': 'var(--color-short-term)',
    'Session': 'var(--color-session)',
    'PracticeSession': 'var(--color-session)',
    'ImmediateGoal': 'var(--color-immediate)',
    'MicroGoal': 'var(--color-micro)',
    'NanoGoal': 'var(--color-nano)',
    'CompletedGoal': 'var(--color-completed)'
};

export const GOAL_COLOR_NAMES = {
    'UltimateGoal': 'Stellar Frost',
    'LongTermGoal': 'Abyss Navy',
    'MidTermGoal': 'Signal Blue',
    'ShortTermGoal': 'Astro Teal',
    'Session': 'Thruster Orange',
    'PracticeSession': 'Thruster Orange',
    'ImmediateGoal': 'Pulse Red',
    'MicroGoal': 'Cosmic Cyan',
    'NanoGoal': 'Stellar Silver',
    'CompletedGoal': 'Achievement Gold'
};

export const GOAL_TEXT_COLORS = {
    'UltimateGoal': '#1a1a1a',
    'LongTermGoal': '#ffffff',
    'MidTermGoal': '#ffffff',
    'ShortTermGoal': '#1a1a1a',
    'Session': '#1a1a1a',
    'PracticeSession': '#1a1a1a',
    'ImmediateGoal': '#ffffff',
    'MicroGoal': '#1a1a1a',
    'NanoGoal': '#1a1a1a',
    'CompletedGoal': '#1a1a1a'
};

/**
 * Get the color for a given goal type
 * @param {string} goalType - The type of goal
 * @returns {string} Hex color code or CSS variable
 */
export function getGoalColor(goalType) {
    return GOAL_COLORS[goalType] || 'var(--success-color)';
}

/**
 * Get the cosmic name for a goal type's color
 * @param {string} goalType - The type of goal
 * @returns {string} Cosmic color name
 */
export function getGoalColorName(goalType) {
    return GOAL_COLOR_NAMES[goalType] || 'Unknown';
}

/**
 * Determine if text should be dark or light based on goal type
 * @param {string} goalType - The type of goal
 * @returns {string} Hex color for text
 */
export function getGoalTextColor(goalType) {
    return GOAL_TEXT_COLORS[goalType] || '#ffffff';
}

