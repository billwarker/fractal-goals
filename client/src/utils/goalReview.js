// @ts-check
/**
 * How a goal's review schedule reads. The server computes the schedule (services/goal_review_rules.py)
 * and sends `goal.review`; this only words it and re-checks "due" against the user's today, since the
 * server works in UTC.
 */
import { formatDueDate } from './goalDueFormat';

export const REVIEW_CADENCE_UNITS = ['days', 'weeks', 'months', 'years'];

/**
 * "every month", "every 3 months".
 * @param {{ value: number, unit: string } | null | undefined} cadence
 */
export function describeCadence(cadence) {
    if (!cadence?.value || !cadence?.unit) return '';
    const singular = cadence.unit.replace(/s$/, '');
    return cadence.value === 1 ? `every ${singular}` : `every ${cadence.value} ${cadence.unit}`;
}

/** @param {any} goal */
export function getGoalReview(goal) {
    return goal?.review ?? goal?.attributes?.review ?? null;
}

/**
 * @param {any} review the goal's `review` payload
 * @param {string} today ISO date in the user's timezone
 * @returns {boolean}
 */
export function isReviewDue(review, today) {
    return Boolean(review?.next_review_on && today && review.next_review_on.slice(0, 10) <= today);
}

/**
 * One line for the goal's review schedule, e.g. "Review every 3 months · next Jan 12".
 * @param {any} review
 * @param {string} today
 * @returns {string | null}
 */
export function describeReview(review, today) {
    if (!review || review.status === 'complete') return null;
    if (review.status === 'off') return 'Reviews off';
    if (review.status === 'none' || !review.cadence) return 'No review cadence';
    const cadence = `Review ${describeCadence(review.cadence)}`;
    if (isReviewDue(review, today)) return `${cadence} · review due`;
    const next = formatDueDate(review.next_review_on, today);
    return review.deferred_until ? `${cadence} · deferred to ${next}` : `${cadence} · next ${next}`;
}

/**
 * A goal_review note's starting text: the goal's description, progress since the last review, and due status.
 * @param {{ name: string, description?: string, lastReviewOn?: string | null, childrenTotal?: number,
 *   childrenCompleted?: number, dueLabel?: string | null, today: string }} input
 */
export function buildReviewTemplate({ name, description, lastReviewOn, childrenTotal = 0, childrenCompleted = 0, dueLabel, today }) {
    const since = lastReviewOn ? `since the last review (${formatDueDate(lastReviewOn, today)})` : 'so far';
    return [
        `## Review: ${name}`,
        '',
        '**The goal**',
        description?.trim() ? description.trim() : '_No description yet._',
        '',
        `**Progress ${since}**`,
        childrenTotal > 0 ? `- ${childrenCompleted} of ${childrenTotal} child goals complete` : '- ',
        dueLabel ? `- ${dueLabel}` : '- No due date',
        '',
        '**What went well**',
        '- ',
        '',
        '**What to change**',
        '- ',
    ].join('\n');
}
