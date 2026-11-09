// @ts-check
/**
 * How a goal's review schedule reads. The server computes the schedule (services/goal_review_rules.py)
 * and sends `goal.review`; this words it, re-checks "due" against the user's today (the server works
 * in UTC), and previews the next review while the cadence is edited. `nextReviewDate` mirrors the
 * server's; both are checked against tests/fixtures/goal_review_cases.json.
 */
import { addInterval, toIsoDate } from './goalDeadlineRules';
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

/** @param {string} later ISO date @param {string} earlier ISO date */
const daysBetween = (later, earlier) => Math.round((Date.parse(later) - Date.parse(earlier)) / 86400000);

/**
 * One cadence after `anchor`, plus the days paused before that date (an open pause counts up to
 * today). A pause that starts once the review is due doesn't move it.
 * @param {string} anchor ISO date: the last review, else the goal's start
 * @param {{ value: number, unit: string } | null | undefined} cadence
 * @param {Array<[string, string | null]>} pauses [paused_on, resumed_on] ISO dates
 * @param {string} today ISO date
 * @returns {{ nextReviewOn: string | null, pausedDays: number }}
 */
export function nextReviewDate(anchor, cadence, pauses, today) {
    let next = cadence ? addInterval(anchor, cadence.value, cadence.unit) : null;
    if (!next) return { nextReviewOn: null, pausedDays: 0 };
    let pausedDays = 0;
    for (const [pausedOn, resumedOn] of [...pauses].sort((a, b) => a[0].localeCompare(b[0]))) {
        const start = pausedOn > anchor ? pausedOn : anchor;
        if (start >= next) break;
        const days = Math.max(daysBetween(resumedOn || today, start), 0);
        next = /** @type {string} */ (addInterval(next, days, 'days'));
        pausedDays += days;
    }
    return { nextReviewOn: next, pausedDays };
}

/** @param {number} count @param {string} noun */
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * When the next review falls under a cadence being edited, e.g. "Next review Nov 12 · 3 months
 * after the last review (Aug 12), plus 14 days paused". While the goal is paused the clock waits.
 * @param {{ cadence: { value: number, unit: string } | null, review?: any, startedAt?: unknown,
 *   createdAt?: unknown, paused?: boolean, today: string }} input
 * @returns {string | null}
 */
export function describeNextReview({ cadence, review, startedAt, createdAt, paused = false, today }) {
    if (!cadence?.value || !cadence?.unit || !today) return null;
    const lastReviewOn = toIsoDate(review?.last_review_on);
    const anchor = lastReviewOn || toIsoDate(startedAt) || toIsoDate(createdAt) || today;
    /** @type {Array<[string, string | null]>} */
    const pauses = (review?.pauses || []).map((/** @type {any} */ pause) => [pause.paused_on, pause.resumed_on]);
    const { nextReviewOn, pausedDays } = nextReviewDate(anchor, cadence, pauses, today);
    if (!nextReviewOn) return null;
    if (paused) {
        const left = daysBetween(nextReviewOn, today);
        return left > 0
            ? `Next review on hold while the goal is paused · ${plural(left, 'day')} left when it resumes`
            : 'Next review on hold while the goal is paused · due when it resumes';
    }
    const length = plural(cadence.value, cadence.unit.replace(/s$/, ''));
    const after = lastReviewOn ? 'the last review' : 'the start date';
    let reason = `${length} after ${after} (${formatDueDate(anchor, today)})`;
    if (pausedDays > 0) reason += `, plus ${plural(pausedDays, 'day')} paused`;
    const deferred = toIsoDate(review?.deferred_until);
    if (deferred && deferred > nextReviewOn) {
        return `Next review ${formatDueDate(deferred, today)} · deferred from ${formatDueDate(nextReviewOn, today)}`;
    }
    if (nextReviewOn === today) return `Review due today · ${reason}`;
    if (nextReviewOn < today) return `Review due since ${formatDueDate(nextReviewOn, today)} · ${reason}`;
    return `Next review ${formatDueDate(nextReviewOn, today)} · ${reason}`;
}

/** A guided review's status choices, in display order. Mirrors STATUS_LABELS in services/goal_review_content.py. */
export const REVIEW_STATUSES = [
    { value: 'on_track', label: 'On track' },
    { value: 'at_risk', label: 'At risk' },
    { value: 'off_track', label: 'Off track' },
];

/** The guided review's questions, keyed by their `review_data` field. */
export const REVIEW_PROMPTS = [
    { key: 'went_well', label: 'What went well?', heading: 'What went well' },
    { key: 'change', label: 'What would you change?', heading: 'What to change' },
    { key: 'next_focus', label: 'What will you focus on until the next review?', heading: 'Focus until the next review' },
];

/**
 * The read-only context a review is written against: what changed since the last review (or the start).
 * @param {{ description?: string, lastReviewOn?: string | null, children?: any[], activityDays?: Array<{ date: string, activities: number }>,
 *   dueLabel?: string | null, today: string }} input
 * @returns {{ since: string, description: string, facts: string[] }}
 */
export function reviewContext({ description, lastReviewOn, children = [], activityDays = [], dueLabel, today }) {
    const after = (/** @type {unknown} */ value) => {
        const day = toIsoDate(value);
        return Boolean(day && (!lastReviewOn || day > lastReviewOn.slice(0, 10)));
    };
    const childrenDone = children.filter((child) => child.completed && (!lastReviewOn || after(child.completed_at))).length;
    const activeDays = activityDays.filter((day) => day.activities > 0 && after(day.date)).length;
    const facts = [`Active on ${plural(activeDays, 'day')}`];
    if (children.length) facts.push(`${childrenDone} of ${plural(children.length, 'child goal')} completed`);
    facts.push(dueLabel || 'No due date');
    return {
        since: lastReviewOn ? `Since the last review (${formatDueDate(lastReviewOn.slice(0, 10), today)})` : 'So far',
        description: description?.trim() || '',
        facts,
    };
}
