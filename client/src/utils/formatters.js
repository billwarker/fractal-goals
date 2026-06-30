import { formatDateInTimezone, formatDateValue } from './dateUtils';

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

export const formatDateTimeParts = (isoString, timezone) => {
    if (!isoString) return { date: '', time: '' };
    try {
        return {
            date: formatDateInTimezone(isoString, timezone, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: undefined,
                minute: undefined,
            }),
            time: formatDateInTimezone(isoString, timezone, {
                year: undefined,
                month: undefined,
                day: undefined,
                hour: 'numeric',
                minute: '2-digit',
            }),
        };
    } catch {
        return { date: '', time: '' };
    }
};

export const formatMetricDisplayValue = (metric) => {
    if (!metric || metric.value == null) return null;
    const value = Number(metric.value);
    const formatted = Number.isFinite(value)
        ? (Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, ''))
        : String(metric.value);
    return `${metric.name || 'Metric'}: ${formatted}${metric.unit ? ` ${metric.unit}` : ''}`;
};
