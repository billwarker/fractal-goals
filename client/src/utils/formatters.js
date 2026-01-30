import moment from 'moment';
import { getShiftedDate } from './dateUtils';

export const formatDate = (dateString, format = 'MMM D, YYYY', timezone = null) => {
    if (!dateString) return '';

    let date = new Date(dateString);

    // If a timezone is provided, shift the date so moment formats it in that timezone
    if (timezone) {
        date = getShiftedDate(date, timezone);
    }

    return moment(date).format(format);
};

export const formatDurationSeconds = (seconds) => {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};
