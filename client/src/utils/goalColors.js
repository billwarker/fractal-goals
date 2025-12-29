/**
 * Cosmic Color Palette for Goal Types
 * Centralized color definitions for consistent theming across the app
 */

export const GOAL_COLORS = {
    'UltimateGoal': '#FFD166',      // Supernova Gold
    'LongTermGoal': '#7B5CFF',      // Nebula Violet
    'MidTermGoal': '#3A86FF',       // Orbital Blue
    'ShortTermGoal': '#4ECDC4',     // Lunar Teal
    'PracticeSession': '#FF9F1C',   // Thruster Orange
    'ImmediateGoal': '#F8F9FA',     // Starlight White
    'MicroGoal': '#A8DADC',         // Placeholder - adjust as needed
    'NanoGoal': '#E0E0E0'           // Placeholder - adjust as needed
};

export const GOAL_COLOR_NAMES = {
    'UltimateGoal': 'Supernova Gold',
    'LongTermGoal': 'Nebula Violet',
    'MidTermGoal': 'Orbital Blue',
    'ShortTermGoal': 'Lunar Teal',
    'PracticeSession': 'Thruster Orange',
    'ImmediateGoal': 'Starlight White',
    'MicroGoal': 'Cosmic Cyan',
    'NanoGoal': 'Stellar Silver'
};

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
