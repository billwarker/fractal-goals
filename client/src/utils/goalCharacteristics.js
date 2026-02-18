/**
 * Default Goal Characteristics
 * 
 * Defines the initial settings for each goal level, including:
 * - icon: The SVG shape used for visualization (circle, square, triangle, etc.)
 * - deadlines: Min/max relative time ranges with units
 * - completion_methods: Valid ways to mark the goal as complete
 */

export const DEFAULT_GOAL_CHARACTERISTICS = {
    UltimateGoal: {
        icon: 'hexagon',
        deadlines: {
            min: { value: 1, unit: 'years' },
            max: { value: 10, unit: 'years' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    LongTermGoal: {
        icon: 'star',
        deadlines: {
            min: { value: 3, unit: 'months' },
            max: { value: 2, unit: 'years' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    MidTermGoal: {
        icon: 'diamond',
        deadlines: {
            min: { value: 1, unit: 'months' },
            max: { value: 6, unit: 'months' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    ShortTermGoal: {
        icon: 'square',
        deadlines: {
            min: { value: 1, unit: 'weeks' },
            max: { value: 2, unit: 'months' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    ImmediateGoal: {
        icon: 'triangle',
        deadlines: {
            min: { value: 1, unit: 'days' },
            max: { value: 14, unit: 'days' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    MicroGoal: {
        icon: 'circle',
        deadlines: {
            min: { value: 1, unit: 'hours' },
            max: { value: 3, unit: 'days' }
        },
        completion_methods: { manual: true, children: true, targets: true }
    },
    NanoGoal: {
        icon: 'square',
        deadline_min: { value: 0, unit: 'none' },
        deadline_max: { value: 0, unit: 'none' }
    },
    Target: {
        icon: 'twelve-point-star',
        color: '#FFD700', // Gold default for targets
        deadline_min: { value: 0, unit: 'none' },
        deadline_max: { value: 0, unit: 'none' }
    },
    Completed: {
        icon: 'check',
        color: '#FFD700',
        deadlines: {
            min: { value: 0, unit: 'none' },
            max: { value: 0, unit: 'none' }
        },
        completion_methods: { manual: false, children: false, targets: false }
    }
};

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
 * Validates if a chosen deadline date is within the allowed relative range.
 * @param {Date|string} deadlineDate - The chosen deadline date
 * @param {Object} goalLevelSettings - The settings for this goal level (from goalCharacteristics)
 * @param {Date|string} relativeBase - The start date (defaults to now)
 * @returns {Object} { isValid, message }
 */
export const validateDeadline = (deadlineDate, goalLevelSettings, relativeBase = new Date()) => {
    if (!goalLevelSettings || !goalLevelSettings.deadlines) return { isValid: true };

    const deadline = new Date(deadlineDate);
    const start = new Date(relativeBase);
    const diffInDays = (deadline - start) / (1000 * 60 * 60 * 24);

    const { min, max } = goalLevelSettings.deadlines;
    const minDays = getDurationInDays(min.value, min.unit);
    const maxDays = getDurationInDays(max.value, max.unit);

    if (diffInDays < minDays) {
        return {
            isValid: false,
            message: `Deadline is too short. Minimum allowed is ${min.value} ${min.unit}.`
        };
    }

    if (diffInDays > maxDays) {
        return {
            isValid: false,
            message: `Deadline is too far out. Maximum allowed is ${max.value} ${max.unit}.`
        };
    }

    return { isValid: true };
};
