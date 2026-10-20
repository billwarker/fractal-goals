/**
 * SMART Goals Utility Functions
 * 
 * SMART goals are:
 * - Specific: Has a description
 * - Measurable: Completes on its own (an activity threshold or its child goals)
 * - Achievable: Has activities associated
 * - Reviewed: Reviewed on a cadence (levels that don't review goals count as met)
 * - Time-bound: Has a deadline
 */

/**
 * Calculate SMART status for a goal
 * @param {Object} goal - Goal object with attributes
 * @returns {Object} Status for each SMART criterion
 */
/**
 * R: reviews on, with a cadence, and no review due — a due review takes R away until one is
 * written. Levels that don't review goals count as met. While editing, the caller attaches the
 * level (`review_level`) so on/off and cadence changes show at once; otherwise the server's schedule
 * is used, with "due" re-checked against today.
 */
function isReviewed(goal, attrs) {
    const review = goal.review ?? attrs.review;
    const dueNow = Boolean(review?.next_review_on && review.next_review_on.slice(0, 10) <= localToday());
    const level = goal.review_level ?? attrs.review_level;
    if (level) {
        if (!level.uses_reviews) return true;
        if (goal.review_disabled ?? attrs.review_disabled) return false;
        if (!((goal.review_cadence_value ?? attrs.review_cadence_value) || level.review_cadence_value)) return false;
        return !dueNow;
    }
    if (!review) return true;
    if (review.status === 'complete') return true;
    return review.status === 'upcoming' && !dueNow;
}

function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function calculateSMARTStatus(goal) {
    if (!goal) {
        return {
            specific: false,
            measurable: false,
            achievable: false,
            reviewed: false,
            timeBound: false
        };
    }

    const attrs = goal.attributes || goal;

    // Get values from either attributes or directly
    const description = attrs.description || goal.description || '';
    const completionCondition = goal.completion_condition ?? attrs.completion_condition ?? 'manual';
    const deadline = attrs.deadline || goal.deadline;
    const associatedActivityIds = attrs.associated_activity_ids || goal.associated_activity_ids || [];
    const completedViaChildren = completionCondition === 'children';

    const trackActivities = attrs.track_activities !== undefined ? attrs.track_activities : (goal.track_activities !== undefined ? goal.track_activities : true);

    // Or use pre-calculated smart_status from backend if available
    const serverSmartStatus = goal.smart_status || attrs.smart_status;
    if (serverSmartStatus) {
        return {
            specific: serverSmartStatus.specific,
            measurable: serverSmartStatus.measurable,
            achievable: serverSmartStatus.achievable,
            // Older published landing snapshots still say `relevant`.
            reviewed: serverSmartStatus.reviewed ?? serverSmartStatus.relevant,
            timeBound: serverSmartStatus.time_bound
        };
    }

    return {
        specific: !!(description && description.trim().length > 0),
        measurable: !trackActivities || completionCondition !== 'manual',
        achievable: !trackActivities || (Array.isArray(associatedActivityIds) && associatedActivityIds.length > 0) || completedViaChildren,
        reviewed: isReviewed(goal, attrs),
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
    const serverIsSmart = goal?.is_smart ?? goal?.attributes?.is_smart;
    if (serverIsSmart !== undefined) {
        return serverIsSmart;
    }

    const status = calculateSMARTStatus(goal);
    return status.specific && status.measurable && status.achievable &&
        status.reviewed && status.timeBound;
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
        description: 'Completes on an activity threshold or its child goals'
    },
    achievable: {
        letter: 'A',
        label: 'Achievable',
        description: 'Has activities associated'
    },
    reviewed: {
        letter: 'R',
        label: 'Reviewed',
        description: 'Reviews are on and up to date'
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
