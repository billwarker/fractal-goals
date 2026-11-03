// @ts-check
/**
 * Existing goals on an analytics chart. A goal's per-session rules sit on the axis of their metric;
 * cumulative totals have no matching axis. The chart marks each goal at its threshold
 * (components/analytics/GoalMarkerLayer.jsx); the annotations here only keep those thresholds
 * inside the axes (chartjs-plugin-annotation stretches a scale to fit its lines).
 */
import { OPERATOR_SYMBOLS } from './goalConditions';

/**
 * @typedef {{ scaleID: string, value: number, symbol: string, metricId: string }} GoalMarkerRule
 * @typedef {{ key: string, goal: any, rules: GoalMarkerRule[] }} GoalMarker
 */

/**
 * One marker per goal with a rule on a charted metric.
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {Record<string, string>} scaleByMetricId metric id → the chart scale id showing it
 * @returns {GoalMarker[]}
 */
export function goalMarkers(goals = [], scaleByMetricId = {}) {
    return goals.flatMap((goal) => {
        const condition = goal.condition;
        if (!condition || condition.kind === 'cumulative') return [];
        const rules = (condition.rules || []).flatMap((/** @type {any} */ rule) => {
            const scaleID = scaleByMetricId[rule.metric_definition_id];
            const value = Number(rule.value);
            if (!scaleID || !Number.isFinite(value)) return [];
            const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)] || rule.operator;
            return [{ scaleID, value, symbol, metricId: rule.metric_definition_id }];
        });
        return rules.length ? [{ key: goal.goal_id, goal, rules }] : [];
    });
}

/**
 * Invisible lines at each goal's thresholds, so the axes reach them.
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {Record<string, string>} scaleByMetricId
 * @returns {Record<string, object>}
 */
export function goalLineAnnotations(goals = [], scaleByMetricId = {}) {
    /** @type {Record<string, object>} */
    const annotations = {};
    goalMarkers(goals, scaleByMetricId).forEach(({ key, rules }) => {
        rules.forEach((rule) => {
            annotations[`goal-${key}-${rule.metricId}`] = {
                type: 'line',
                scaleID: rule.scaleID,
                value: rule.value,
                borderColor: 'transparent',
                borderWidth: 0,
            };
        });
    });
    return annotations;
}
