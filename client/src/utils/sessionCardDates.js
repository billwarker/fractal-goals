import { formatDateInTimezone } from './dateUtils';

/**
 * Dates on session cards: a bare calendar date (YYYY-MM-DD) as a local date, anything else
 * as a timestamp in the viewer's timezone. Shared by the Sessions page and the Programs Days tab.
 */
export function formatSessionCardDate(dateString, timezone, options = {}) {
    if (!dateString) return '';
    if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-') && !dateString.includes('T')) {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
    return formatDateInTimezone(dateString, timezone, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options,
    });
}
