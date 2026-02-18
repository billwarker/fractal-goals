/**
 * Cosmic Color Palette for Goal Types
 * Centralized color definitions for consistent theming across the app
 * Includes primary colors (for main elements) and secondary colors (for SMART ring fills)
 */

export const GOAL_COLOR_SYSTEM = {
    UltimateGoal: {
        primary: '#E9F0FF',
        primaryName: 'Stellar Frost',
        secondary: '#7A1E3A',
        secondaryName: 'Crimson Nebula',
        contrastRatio: 8.86
    },

    LongTermGoal: {
        primary: '#5C6AC4',
        primaryName: 'Soft Indigo',
        secondary: '#FFB703',
        secondaryName: 'Solar Amber',
        contrastRatio: 2.79
    },

    MidTermGoal: {
        primary: '#3A86FF',
        primaryName: 'Signal Blue',
        secondary: '#FF6B35',
        secondaryName: 'Plasma Orange',
        contrastRatio: 1.23
    },

    ShortTermGoal: {
        primary: '#2EC4B6',
        primaryName: 'Astro Teal',
        secondary: '#8D1B3D',
        secondaryName: 'Cosmic Magenta',
        contrastRatio: 4.11
    },

    Session: {
        primary: '#FF9F1C',
        primaryName: 'Thruster Orange',
        secondary: '#1D3557',
        secondaryName: 'Deep Orbit Navy',
        contrastRatio: 6.02
    },

    PracticeSession: {
        primary: '#FF9F1C',
        primaryName: 'Thruster Orange',
        secondary: '#1D3557',
        secondaryName: 'Deep Orbit Navy',
        contrastRatio: 6.02
    },

    ImmediateGoal: {
        primary: '#E63946',
        primaryName: 'Pulse Red',
        secondary: '#1D4ED8',
        secondaryName: 'Ion Blue',
        contrastRatio: 1.61
    },

    MicroGoal: {
        primary: '#A8DADC',
        primaryName: 'Drift Teal',
        secondary: '#6D28D9',
        secondaryName: 'Electric Violet',
        contrastRatio: 4.64
    },

    NanoGoal: {
        primary: '#E0E0E0',
        primaryName: 'Cosmic Dust',
        secondary: '#7C2D12',
        secondaryName: 'Rust Nova',
        contrastRatio: 7.1
    },

    Completed: {
        primary: '#FFD700',
        primaryName: 'Achievement Gold',
        secondary: '#4C1D95',
        secondaryName: 'Royal Void Violet',
        contrastRatio: 7.81
    }
};

// Backward compatibility exports
export const GOAL_COLORS = Object.fromEntries(
    Object.entries(GOAL_COLOR_SYSTEM).map(([key, value]) => [key, value.primary])
);

export const GOAL_COLOR_NAMES = Object.fromEntries(
    Object.entries(GOAL_COLOR_SYSTEM).map(([key, value]) => [key, value.primaryName])
);

export const GOAL_SECONDARY_COLORS = Object.fromEntries(
    Object.entries(GOAL_COLOR_SYSTEM).map(([key, value]) => [key, value.secondary])
);

export const GOAL_SECONDARY_COLOR_NAMES = Object.fromEntries(
    Object.entries(GOAL_COLOR_SYSTEM).map(([key, value]) => [key, value.secondaryName])
);

/**
 * Get the color for a given goal type
 * @param {string} goalType - The type of goal
 * @returns {string} Hex color code
 */
export function getGoalColor(goalType) {
    return GOAL_COLORS[goalType] || '#4caf50'; // Fallback to green
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
 * Get the secondary color for a given goal type (used for SMART ring fills)
 * @param {string} goalType - The type of goal
 * @returns {string} Hex color code
 */
export function getGoalSecondaryColor(goalType) {
    return GOAL_SECONDARY_COLORS[goalType] || '#1a1a1a'; // Fallback to dark
}

/**
 * Get the cosmic name for a goal type's secondary color
 * @param {string} goalType - The type of goal
 * @returns {string} Cosmic color name
 */
export function getGoalSecondaryColorName(goalType) {
    return GOAL_SECONDARY_COLOR_NAMES[goalType] || 'Unknown';
}

/**
 * Get a darker shade of the goal color (for borders, hover states, etc.)
 * @param {string} goalType - The type of goal
 * @param {number} amount - Amount to darken (0-1, default 0.2)
 * @returns {string} Darkened hex color
 */
export function getGoalColorDark(goalType, amount = 0.2) {
    const color = getGoalColor(goalType);
    return adjustBrightness(color, -amount);
}

/**
 * Adjust brightness of a hex color
 * @param {string} hex - Hex color code
 * @param {number} percent - Percentage to adjust (-1 to 1)
 * @returns {string} Adjusted hex color
 */
function adjustBrightness(hex, percent) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Convert to RGB
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Adjust
    r = Math.min(255, Math.max(0, r + (r * percent)));
    g = Math.min(255, Math.max(0, g + (g * percent)));
    b = Math.min(255, Math.max(0, b + (b * percent)));

    // Convert back to hex
    const rr = Math.round(r).toString(16).padStart(2, '0');
    const gg = Math.round(g).toString(16).padStart(2, '0');
    const bb = Math.round(b).toString(16).padStart(2, '0');

    return `#${rr}${gg}${bb}`;
}

/**
 * Determine if text should be dark or light based on background color
 * @param {string} goalType - The type of goal
 * @returns {string} 'dark' or 'light'
 */
export function getGoalTextColor(goalType) {
    const color = getGoalColor(goalType);

    // Remove # if present
    const hex = color.replace('#', '');

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate perceived brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    // Return dark text for bright backgrounds, light text for dark backgrounds
    return brightness > 155 ? '#1a1a1a' : '#ffffff';
}
