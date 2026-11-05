// @ts-check
/**
 * One formatter for analytics charts: durations, metric values (by the metric's own type, precision,
 * bounds and allowed values) and time-bucket labels. Axes, tooltips, legends and the annotation
 * readout all go through here so a value reads the same everywhere on a chart.
 */
import {
    clampMetricValue,
    formatMetricValueForInput,
    getAllowedMetricValues,
    getMetricPrecision,
} from './sessionActivityMetrics';

/** @typedef {'day' | 'week' | 'month'} Grain */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "1h 5m", "45m", "0m" (short) or "1:05:00" / "05:00" (clock).
 * @param {number | null | undefined} seconds
 * @param {{ style?: 'short' | 'clock' }} [options]
 */
export function formatDuration(seconds, { style = 'short' } = {}) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (style === 'clock') {
        const secs = total % 60;
        const mmss = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        return hours > 0 ? `${hours}:${mmss}` : mmss;
    }
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    return `${minutes}m`;
}

/**
 * A raw chart value (e.g. read off an axis at the pointer) moved to the nearest value the metric can
 * hold: one of its predefined values, else clamped to its bounds and rounded to its resolution
 * (whole numbers for integers, its precision for numbers and durations).
 * @param {any} metricDef
 * @param {number | string | null | undefined} raw
 * @returns {number | null}
 */
export function snapMetricValue(metricDef, raw) {
    const value = Number(raw);
    if (raw == null || raw === '' || !Number.isFinite(value)) return null;
    const allowed = getAllowedMetricValues(metricDef).map(Number).filter(Number.isFinite);
    if (allowed.length) {
        return allowed.reduce((best, candidate) => (
            Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
        ));
    }
    const clamped = Number(clampMetricValue(metricDef, value));
    if (metricDef?.input_type === 'integer') return Math.round(clamped);
    const factor = 10 ** getMetricPrecision(metricDef);
    return Math.round((clamped + Number.EPSILON) * factor) / factor;
}

/**
 * A metric value as the metric displays it: mm:ss for durations, its precision for numbers, whole
 * numbers for integers, followed by its unit.
 * @param {any} metricDef
 * @param {number | string | null | undefined} value
 * @param {{ withUnit?: boolean }} [options]
 */
export function formatMetric(metricDef, value, { withUnit = true } = {}) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    const text = formatMetricValueForInput(metricDef, value);
    const unit = metricDef?.unit || metricDef?.fractal_metric?.unit;
    return withUnit && unit && metricDef?.input_type !== 'duration' ? `${text} ${unit}` : text;
}

/** @param {string} dateKey "YYYY-MM-DD" (a time part is ignored) */
function parseDateKey(dateKey) {
    const [year, month, day] = String(dateKey).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
}

/** @param {Date} date */
const shortDay = (date) => `${MONTHS[date.getMonth()]} ${date.getDate()}`;

/**
 * Axis label for a bucket that starts on dateKey.
 * @param {string} dateKey
 * @param {Grain} grain
 */
export function formatBucketLabel(dateKey, grain) {
    const date = parseDateKey(dateKey);
    if (grain === 'month') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    return shortDay(date);
}

/**
 * Tooltip title for a bucket that starts on dateKey: the day, the week's span, or the month.
 * @param {string} dateKey
 * @param {Grain} grain
 */
export function formatBucketRange(dateKey, grain) {
    const date = parseDateKey(dateKey);
    if (grain === 'month') return `${LONG_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    if (grain === 'week') {
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6);
        return `${shortDay(date)} – ${shortDay(end)}, ${end.getFullYear()}`;
    }
    return `${WEEKDAYS[date.getDay()]}, ${shortDay(date)}, ${date.getFullYear()}`;
}

/**
 * Chart.js tick callback for a value axis.
 * @param {'duration' | 'hours' | 'metric' | 'count'} kind
 * @param {any} [metricDef]
 * @returns {(value: number | string) => string}
 */
export function axisTickFormatter(kind, metricDef) {
    if (kind === 'duration') return (value) => formatDuration(Number(value));
    if (kind === 'hours') return (value) => `${Number(value)}h`;
    if (kind === 'metric') return (value) => formatMetric(metricDef, value, { withUnit: false });
    return (value) => (Number.isInteger(Number(value)) ? String(value) : '');
}
