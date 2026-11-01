// @ts-check
/**
 * Turning a point on an analytics chart into a goal: which condition it suggests and how that reads.
 * Pure, so each chart's mapping is tested on its own; the chart surface reads values off the chart's
 * scales and hands them here.
 */
import { formatMetric, snapMetricValue } from './chartFormat';
import { activeMetricDefinitions, createConditionDraft, inferOperator, OPERATOR_SYMBOLS } from './goalConditions';

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
        .map(({ metricId, value }) => {
            const metric = findMetric(activity, metricId);
            return { metric, value: metric && Number.isFinite(value) ? snapMetricValue(metric, value) : null };
        })
        .filter(({ metric, value }) => metric && value != null && value > 0)
        .map(({ metric, value }) => ({
            metric,
            value,
            rule: { metric_definition_id: metric.id, operator: inferOperator(metric), value: String(value) },
        }));
    if (rules.length === 0) return null;
    const summary = rules
        .map(({ metric, value, rule }) => `${metric.name} ${OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)]} ${formatMetric(metric, value)}`)
        .join(', ');
    return {
        conditionDraft: { ...createConditionDraft(activity, 'single_session'), rules: rules.map(({ rule }) => rule) },
        summary: `${summary} within one session`,
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
 * Scatter: the point's x and y become two rules met within one session.
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

/**
 * Activity Trends' running total: a point (date, total) becomes "this many more times by then".
 * The goal counts sessions from its start, so the target is what's still to do beyond today's total.
 * @param {{ activity: any, total: number, current: number, deadline: string, deadlineLabel: string }} input
 */
export function goalFromRunningTotal({ activity, total, current, deadline, deadlineLabel }) {
    if (!activity || !Number.isFinite(total) || !deadline) return null;
    const remaining = Math.round(total) - Math.round(current || 0);
    if (remaining < 1) return { unsupported: `Already done ${Math.round(current || 0)} times — pick a higher total` };
    return {
        conditionDraft: { ...createConditionDraft(activity, 'consistency'), required_count: String(remaining) },
        deadline,
        summary: `${remaining} more ${activity.name} ${remaining === 1 ? 'session' : 'sessions'} by ${deadlineLabel}`,
    };
}

/**
 * The chart's tag scope carried into a goal: the global tag filter (`all` reads as `contains`) and a
 * tag series under the pointer. Template and program-day scope can't be part of a condition, so the
 * goal says so instead.
 * @param {any} target a goal suggestion with a conditionDraft
 * @param {{ tags?: { tagIds: string[], match: string } | null, sessions?: { templateIds: string[], programDayIds: string[] } } | null} filters
 * @param {string | null} [seriesTagId]
 */
export function withChartScope(target, filters, seriesTagId = null) {
    if (!target?.conditionDraft) return target;
    const tagIds = [...new Set([...(filters?.tags?.tagIds || []), ...(seriesTagId ? [seriesTagId] : [])])];
    const notes = [];
    if (filters?.sessions?.templateIds?.length) notes.push('The template filter isn’t part of the goal condition.');
    if (filters?.sessions?.programDayIds?.length) notes.push('The program day filter isn’t part of the goal condition.');
    return {
        ...target,
        conditionDraft: {
            ...target.conditionDraft,
            tag_ids: tagIds,
            tag_match: filters?.tags?.match === 'exact' && !seriesTagId ? 'exact' : 'contains',
        },
        notes,
    };
}

