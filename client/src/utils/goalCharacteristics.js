/**
 * Goal Characteristics - Shared Constants
 * 
 * Pure constants and utilities used by goal-related components.
 * Level-specific settings (deadlines, behavior flags) are now DB-driven
 * and accessed via GoalLevelsContext.
 */

export const DEADLINE_UNITS = [
    { label: 'Minutes', value: 'minutes' },
    { label: 'Hours', value: 'hours' },
    { label: 'Days', value: 'days' },
    { label: 'Weeks', value: 'weeks' },
    { label: 'Months', value: 'months' },
    { label: 'Years', value: 'years' },
    { label: 'Decades', value: 'decades' }
];

export const ICON_SHAPES = [
    { label: 'Circle', value: 'circle' },
    { label: 'Square', value: 'square' },
    { label: 'Triangle', value: 'triangle' },
    { label: 'Star', value: 'star' },
    { label: 'Hexagon', value: 'hexagon' },
    { label: 'Diamond', value: 'diamond' },
    { label: 'Twelve Point Star', value: 'twelve-point-star' }
];

export const getDurationInDays = (value, unit) => {
    switch (unit) {
        case 'minutes': return value / (24 * 60);
        case 'hours': return value / 24;
        case 'days': return value;
        case 'weeks': return value * 7;
        case 'months': return value * 30.44; // average month
        case 'years': return value * 365.25;
        case 'decades': return value * 3652.5;
        default: return value;
    }
};

/**
 * Validates if a chosen deadline date is within the allowed range (in days).
 * Uses DB-driven min/max days from GoalLevelsContext instead of hardcoded defaults.
 * @param {Date|string} deadlineDate - The chosen deadline date
 * @param {number|null} minDays - Minimum allowed days from level characteristics
 * @param {number|null} maxDays - Maximum allowed days from level characteristics
 * @param {Date|string} relativeBase - The start date (defaults to now)
 * @returns {Object} { isValid, message }
 */
export const validateDeadlineRange = (deadlineDate, minDays, maxDays, relativeBase = new Date()) => {
    if (minDays == null && maxDays == null) return { isValid: true };

    const deadline = new Date(deadlineDate);
    const start = new Date(relativeBase);
    const diffInDays = (deadline - start) / (1000 * 60 * 60 * 24);

    if (minDays != null && diffInDays < minDays) {
        return {
            isValid: false,
            message: `Deadline is too short. Minimum is ${minDays} days.`
        };
    }

    if (maxDays != null && diffInDays > maxDays) {
        return {
            isValid: false,
            message: `Deadline is too far out. Maximum is ${maxDays} days.`
        };
    }

    return { isValid: true };
};
