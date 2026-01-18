/**
 * SMART Goals Utility Functions
 * 
 * SMART goals are:
 * - Specific: Has a description
 * - Measurable: Has targets attached
 * - Achievable: Has activities associated
 * - Relevant: Has relevance statement explaining connection to parent goal
 * - Time-bound: Has a deadline
 */

/**
 * Calculate SMART status for a goal
 * @param {Object} goal - Goal object with attributes
 * @returns {Object} Status for each SMART criterion
 */
export function calculateSMARTStatus(goal) {
    if (!goal) {
        return {
            specific: false,
            measurable: false,
            achievable: false,
            relevant: false,
            timeBound: false
        };
    }

    const attrs = goal.attributes || goal;

    // Get values from either attributes or directly
    const description = attrs.description || goal.description || '';
    const targets = attrs.targets || goal.targets || [];
    const relevanceStatement = attrs.relevance_statement || goal.relevance_statement || '';
    const deadline = attrs.deadline || goal.deadline;
    const associatedActivityIds = attrs.associated_activity_ids || goal.associated_activity_ids || [];
    const completedViaChildren = attrs.completed_via_children || goal.completed_via_children || false;

    const trackActivities = attrs.track_activities !== undefined ? attrs.track_activities : (goal.track_activities !== undefined ? goal.track_activities : true);

    // Or use pre-calculated smart_status from backend if available
    if (attrs.smart_status) {
        return {
            specific: attrs.smart_status.specific,
            measurable: attrs.smart_status.measurable,
            achievable: attrs.smart_status.achievable,
            relevant: attrs.smart_status.relevant,
            timeBound: attrs.smart_status.time_bound
        };
    }

    return {
        specific: !!(description && description.trim().length > 0),
        measurable: !trackActivities || (Array.isArray(targets) && targets.length > 0) || completedViaChildren,
        achievable: !trackActivities || (Array.isArray(associatedActivityIds) && associatedActivityIds.length > 0) || completedViaChildren,
        relevant: !!(relevanceStatement && relevanceStatement.trim().length > 0),
        timeBound: !!deadline
    };
}

/**
 * Check if a goal is fully SMART
 * @param {Object} goal - Goal object with attributes
 * @returns {boolean} True if all SMART criteria are met
 */
export function isSMART(goal) {
    // Use pre-calculated value from backend if available
    if (goal?.attributes?.is_smart !== undefined) {
        return goal.attributes.is_smart;
    }

    const status = calculateSMARTStatus(goal);
    return status.specific && status.measurable && status.achievable &&
        status.relevant && status.timeBound;
}

/**
 * Get the count of met SMART criteria
 * @param {Object} goal - Goal object with attributes
 * @returns {number} Number of criteria met (0-5)
 */
export function getSMARTCount(goal) {
    const status = calculateSMARTStatus(goal);
    return Object.values(status).filter(Boolean).length;
}

/**
 * SMART criteria labels and descriptions
 */
export const SMART_CRITERIA = {
    specific: {
        letter: 'S',
        label: 'Specific',
        description: 'Has a clear description'
    },
    measurable: {
        letter: 'M',
        label: 'Measurable',
        description: 'Has targets attached'
    },
    achievable: {
        letter: 'A',
        label: 'Achievable',
        description: 'Has activities associated'
    },
    relevant: {
        letter: 'R',
        label: 'Relevant',
        description: 'Explains connection to parent goal'
    },
    timeBound: {
        letter: 'T',
        label: 'Time-bound',
        description: 'Has a deadline'
    }
};

/**
 * Get tooltip text for a SMART criterion
 * @param {string} criterion - Criterion key (specific, measurable, etc.)
 * @param {boolean} isMet - Whether the criterion is met
 * @returns {string} Tooltip text
 */
export function getSMARTTooltip(criterion, isMet) {
    const info = SMART_CRITERIA[criterion];
    if (!info) return '';

    const status = isMet ? '✓' : '✗';
    return `${info.label} ${status}: ${info.description}`;
}
