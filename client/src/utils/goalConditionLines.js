// @ts-check
/**
 * Existing goals on an analytics chart. A goal's per-session rules sit on the axis of their metric;
 * cumulative totals have no matching axis. The chart marks each goal at its threshold
 * (components/analytics/GoalMarkerLayer.jsx); the annotations here only keep those thresholds
 * inside the axes (chartjs-plugin-annotation stretches a scale to fit its lines).
 *
 * One icon can only stand for a goal when one point says everything about it: a single rule, or
 * two rules across a scatter plot's x and y. So a goal with a rule off this chart, or with rules
 * on separate value axes (Metric Trends draws each metric on its own), isn't marked at all.
 */
import { OPERATOR_SYMBOLS } from './goalConditions';

/**
 * A yield goal sits on the Yield line's axis only when the line plots what it measures: a session's
 * top set, average set or total.
 *
 * @typedef {{ scaleID: string, value: number, symbol: string, metricId: string }} GoalMarkerRule
 * @typedef {{ key: string, goal: any, rules: GoalMarkerRule[] }} GoalMarker
 */

/** Whether these rules land on one point: one rule, or one each on the x and y axes. */
function onOnePoint(rules) {
    if (rules.length === 1) return true;
    const scales = rules.map((rule) => rule.scaleID).sort();
    return scales.length === 2 && scales[0] === 'x' && scales[1] === 'y';
}

/** Whether a yield goal measures what the Yield line plots under this sets handling. @param {any} condition @param {string} setsHandling */
function matchesYieldLine(condition, setsHandling) {
    if (setsHandling === 'total') return condition.measure === 'yield';
    const averages = condition.set_aggregate === 'average';
    return condition.measure === 'set_yield' && (setsHandling === 'average' ? averages : !averages);
}

/**
 * One marker per goal that a single point on this chart can show.
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {Record<string, string>} scaleByMetricId metric id → the chart scale id showing it
 * @param {string} [setsHandling] what the chart's Yield line plots
 * @returns {GoalMarker[]}
 */
export function goalMarkers(goals = [], scaleByMetricId = {}, setsHandling = 'top') {
    return goals.flatMap((goal) => {
        const condition = goal.condition;
        if (!condition || condition.kind === 'cumulative') return [];
        const isYield = condition.measure === 'yield' || condition.measure === 'set_yield';
        if (isYield && !matchesYieldLine(condition, setsHandling)) return [];
        const conditionRules = isYield
            ? [{ metric_definition_id: 'yield', operator: condition.operator, value: condition.target_value }]
            : condition.rules || [];
        const rules = conditionRules.flatMap((/** @type {any} */ rule) => {
            const scaleID = scaleByMetricId[rule.metric_definition_id];
            const value = Number(rule.value);
            if (!scaleID || !Number.isFinite(value)) return [];
            const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)] || rule.operator;
            return [{ scaleID, value, symbol, metricId: rule.metric_definition_id }];
        });
        return rules.length === conditionRules.length && rules.length && onOnePoint(rules)
            ? [{ key: goal.goal_id, goal, rules }]
            : [];
    });
}

/**
 * The goals to mark on one goal's progress chart: others on the per-session axes it shares with them,
 * and that goal itself, first, at its threshold, whatever it measures, since the whole chart is about it.
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {string | null | undefined} goalId the chart's goal
 * @param {Record<string, string>} scaleByMetricId metric id → the chart scale id showing it
 * @param {string} [setsHandling]
 * @param {Array<{ id: string, threshold: number | null, operator: string }>} [series] the chart's series
 * @returns {GoalMarker[]}
 */
export function goalChartMarkers(goals = [], goalId, scaleByMetricId = {}, setsHandling = 'top', series = []) {
    const markers = goalMarkers(goals, scaleByMetricId, setsHandling);
    const own = markers.find((marker) => marker.key === goalId);
    if (own) return [own, ...markers.filter((marker) => marker !== own)];
    const goal = goals.find((row) => row.goal_id === goalId);
    const scaleIndex = series.findIndex((row) => row.threshold != null);
    if (!goal || scaleIndex < 0) return markers;
    const { id: metricId, threshold, operator } = series[scaleIndex];
    const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (operator)] || operator || '';
    return [{ key: goal.goal_id, goal, rules: [{ scaleID: `y${scaleIndex}`, value: Number(threshold), symbol, metricId }] }, ...markers];
}

/**
 * Whether a goal's marker stands at this value on this scale, so it needs no line of its own.
 * @param {GoalMarker[]} markers
 * @param {string} scaleID
 * @param {number} value
 */
export const isMarkedThreshold = (markers, scaleID, value) => markers.some(({ rules }) => (
    rules.some((rule) => rule.scaleID === scaleID && rule.value === value)
));

/**
 * Invisible lines at each goal's thresholds, so the axes reach them.
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {Record<string, string>} scaleByMetricId
 * @param {string} [setsHandling]
 * @returns {Record<string, object>}
 */
export function goalLineAnnotations(goals = [], scaleByMetricId = {}, setsHandling = 'top') {
    /** @type {Record<string, object>} */
    const annotations = {};
    goalMarkers(goals, scaleByMetricId, setsHandling).forEach(({ key, rules }) => {
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
