import moment from 'moment';

export const formatDate = (dateString, format = 'MMM D, YYYY') => {
    if (!dateString) return '';
    return moment(dateString).format(format);
};

export const formatDurationSeconds = (seconds) => {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};
