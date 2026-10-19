// @ts-check
/**
 * How a goal's due date reads in the Program calendar's Goals pane: relative within 30 days
 * ("Today", "In 5d", "3d overdue"), absolute beyond ("Jan 12", with the year when it differs).
 * Within 7 days is "soon"; past due is "overdue". Dates are calendar days in the user's timezone,
 * so callers pass `today` from that timezone.
 */
import { toIsoDate } from './goalDeadlineRules';

const RELATIVE_WINDOW_DAYS = 30;
const SOON_DAYS = 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {string} iso */
const utcDay = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
};

/** @param {string} iso @param {string} todayIso */
function absoluteLabel(iso, todayIso) {
    const [year, month, day] = iso.split('-').map(Number);
    const label = `${MONTHS[month - 1]} ${day}`;
    return year === Number(todayIso.slice(0, 4)) ? label : `${label}, ${year}`;
}

/**
 * @param {unknown} deadline
 * @param {unknown} today
 * @returns {{ label: string, tone: 'overdue' | 'soon' | 'normal', daysUntil: number, description: string } | null}
 */
export function describeGoalDue(deadline, today) {
    const due = toIsoDate(deadline);
    const todayIso = toIsoDate(today);
    if (!due || !todayIso) return null;
    const daysUntil = utcDay(due) - utcDay(todayIso);
    const absolute = absoluteLabel(due, todayIso);
    let label = absolute;
    if (Math.abs(daysUntil) < RELATIVE_WINDOW_DAYS) {
        if (daysUntil === 0) label = 'Today';
        else if (daysUntil === 1) label = 'Tomorrow';
        else if (daysUntil === -1) label = 'Yesterday';
        else label = daysUntil > 0 ? `In ${daysUntil}d` : `${-daysUntil}d overdue`;
    }
    const tone = daysUntil < 0 ? 'overdue' : (daysUntil <= SOON_DAYS ? 'soon' : 'normal');
    const relative = daysUntil === 0
        ? 'today'
        : daysUntil > 0
            ? `in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`
            : `${-daysUntil} ${daysUntil === -1 ? 'day' : 'days'} overdue`;
    return { label, tone, daysUntil, description: `Due ${absoluteLabel(due, '0000')} (${relative})` };
}

/**
 * Short calendar date for warnings and toasts, e.g. "Oct 22" (with the year when it differs).
 * @param {unknown} value
 * @param {unknown} today
 */
export function formatDueDate(value, today) {
    const iso = toIsoDate(value);
    const todayIso = toIsoDate(today) || iso;
    return iso && todayIso ? absoluteLabel(iso, todayIso) : '';
}
