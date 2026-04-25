import { formatDateValue } from './dateUtils';

export const formatDate = (dateString, format = 'MMM D, YYYY', timezone = null) => {
    if (!dateString) return '';
    return formatDateValue(dateString, format, timezone);
};

export const formatDurationSeconds = (seconds) => {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};
