// @ts-check
/**
 * How a goal's due date reads beside its name (Program calendar Goals pane, goal flow tree): a
 * compact relative time ("Today", "5d", "2.4mo", "8.2y"), negative once overdue ("-3d"). Within 7
 * days is "soon"; past due is "overdue". Dates are calendar days in the user's timezone, so callers
 * pass `today` from that timezone.
 */
import { toIsoDate } from './goalDeadlineRules';

const SOON_DAYS = 7;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365;
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
    const days = Math.abs(daysUntil);
    const months = (days / DAYS_PER_MONTH).toFixed(1);
    let span = `${days}d`;
    // Years once months would round to 12, so it never reads "12.0mo".
    if (days >= DAYS_PER_YEAR || Number(months) >= 12) span = `${(days / DAYS_PER_YEAR).toFixed(1)}y`;
    else if (days >= 30) span = `${months}mo`;
    const label = daysUntil === 0 ? 'Today' : `${daysUntil < 0 ? '-' : ''}${span}`;
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
