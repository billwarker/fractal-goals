import { subtractDaysToDateString } from '../../utils/dateUtils';

export const LOG_RANGE_OPTIONS = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: 'custom', label: 'Custom' },
];

// Event domains in the order the server sends them (services/log_service.py ACTIVITY_DOMAINS).
export const LOG_DOMAIN_KEYS = ['goals', 'sessions', 'activities', 'programs', 'notes', 'other'];

// The activity chart's longest daily range (the server's limit).
export const MAX_CHART_DAYS = 366;

/** The inclusive date range for a preset ending `today` (YYYY-MM-DD), or the custom dates. */
export function resolveLogRange(range, today, custom = {}) {
    if (range === 'custom') return { startDate: custom.startDate || '', endDate: custom.endDate || '' };
    return { startDate: subtractDaysToDateString(today, Number(range) - 1), endDate: today };
}

const RELATIVE_STEPS = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
];

/** "5 minutes ago", "yesterday", "3 weeks ago"; "just now" under a minute. */
export function formatRelativeTime(value, now = new Date()) {
    const seconds = (new Date(value).getTime() - now.getTime()) / 1000;
    if (!Number.isFinite(seconds)) return '';
    if (Math.abs(seconds) < 60) return 'just now';
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const [unit, size] = RELATIVE_STEPS.find(([, step]) => Math.abs(seconds) >= step);
    return formatter.format(Math.round(seconds / size), unit);
}
