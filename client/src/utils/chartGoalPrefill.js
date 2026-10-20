// @ts-check
/**
 * Turning a point on an analytics chart into a goal: which condition it suggests and how that reads.
 * Pure, so each chart's mapping is tested on its own; the chart surface reads values off the chart's
 * scales and hands them here.
 */
import { activeMetricDefinitions, createConditionDraft, inferOperator, OPERATOR_SYMBOLS } from './goalConditions';

const roundValue = (/** @type {number} */ value) => Math.round(value * 100) / 100;

/** @param {any} activity @param {string} metricId */
function findMetric(activity, metricId) {
    return activeMetricDefinitions(activity).find((/** @type {any} */ metric) => String(metric.id) === String(metricId)) || null;
}

/**
 * @param {any} activity
 * @param {Array<{ metricId: string, value: number }>} points
 * @returns {{ conditionDraft: any, summary: string } | null}
 */
function singleSessionTarget(activity, points) {
    const rules = points
        .map(({ metricId, value }) => ({ metric: findMetric(activity, metricId), value }))
        .filter(({ metric, value }) => metric && Number.isFinite(value) && value > 0)
        .map(({ metric, value }) => ({
            metric,
            rule: { metric_definition_id: metric.id, operator: inferOperator(metric), value: String(roundValue(value)) },
        }));
    if (rules.length === 0) return null;
    const summary = rules
        .map(({ metric, rule }) => `${metric.name} ${OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)]} ${rule.value}${metric.unit ? ` ${metric.unit}` : ''}`)
        .join(', ');
    return {
        conditionDraft: { ...createConditionDraft(activity, 'single_session'), rules: rules.map(({ rule }) => rule) },
        summary: `${summary} in one session`,
    };
}

/**
 * Metric Trends: the y-value on the nearest metric's axis becomes a one-session rule.
 * @param {{ activity: any, metricId: string, value: number }} input
 */
export function goalFromMetricTrend({ activity, metricId, value }) {
    return singleSessionTarget(activity, [{ metricId, value }]);
}

/**
 * Scatter: the point's x and y become two rules met in one session.
 * @param {{ activity: any, metricX: string, x: number, metricY: string, y: number }} input
 */
export function goalFromScatterPoint({ activity, metricX, x, metricY, y }) {
    return singleSessionTarget(activity, [{ metricId: metricX, value: x }, { metricId: metricY, value: y }]);
}

/**
 * Metric Progress plots % improvement, so the point means "this much better than the latest
 * session": the latest value moved by that percentage in the metric's better direction.
 * @param {{ activity: any, metricId: string, percent: number, latestValue: number | null }} input
 */
export function goalFromMetricProgress({ activity, metricId, percent, latestValue }) {
    const metric = findMetric(activity, metricId);
    if (!metric || !Number.isFinite(latestValue) || !Number.isFinite(percent) || percent <= 0) return null;
    const better = inferOperator(metric) === '>=' ? 1 : -1;
    return singleSessionTarget(activity, [{
        metricId, value: /** @type {number} */ (latestValue) * (1 + better * (percent / 100)),
    }]);
}

/**
 * Activity Totals (completed instances): the count becomes "N sessions" (a consistency condition).
 * Duration totals have no condition to map to.
 * @param {{ activity: any, measure: 'instances' | 'duration', value: number }} input
 */
export function goalFromActivityTotal({ activity, measure, value }) {
    if (measure !== 'instances' || !activity || !Number.isFinite(value) || value < 1) return null;
    const count = Math.max(1, Math.round(value));
    return {
        conditionDraft: { ...createConditionDraft(activity, 'consistency'), required_count: String(count) },
        summary: `${count} ${activity.name} ${count === 1 ? 'session' : 'sessions'}`,
    };
}
