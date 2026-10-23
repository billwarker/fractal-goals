// @ts-check
/**
 * Existing goals as reference lines on an analytics chart (chartjs-plugin-annotation). A goal's
 * per-session rules sit on the axis of their metric; cumulative totals have no matching axis.
 */
import { OPERATOR_SYMBOLS } from './goalConditions';

const OPEN_COLOR = 'rgba(245, 158, 11, 0.9)';
const DONE_COLOR = 'rgba(16, 185, 129, 0.55)';

/**
 * @param {Array<{ goal_id: string, goal_name: string, completed: boolean, condition: any }>} goals
 * @param {Record<string, string>} scaleByMetricId metric id → the chart scale id showing it
 * @returns {Record<string, object>}
 */
export function goalLineAnnotations(goals = [], scaleByMetricId = {}) {
    /** @type {Record<string, object>} */
    const annotations = {};
    goals.forEach((goal) => {
        const condition = goal.condition;
        if (!condition || condition.kind === 'cumulative') return;
        (condition.rules || []).forEach((/** @type {any} */ rule) => {
            const scaleID = scaleByMetricId[rule.metric_definition_id];
            const value = Number(rule.value);
            if (!scaleID || !Number.isFinite(value)) return;
            const color = goal.completed ? DONE_COLOR : OPEN_COLOR;
            const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)] || rule.operator;
            annotations[`goal-${goal.goal_id}-${rule.metric_definition_id}`] = {
                type: 'line',
                scaleID,
                value,
                borderColor: color,
                borderWidth: 1.5,
                borderDash: [6, 4],
                label: {
                    display: true,
                    content: `${goal.goal_name} (${symbol} ${value})`,
                    position: 'end',
                    backgroundColor: color,
                    color: '#111',
                    font: { size: 10, weight: 600 },
                    padding: 3,
                },
            };
        });
    });
    return annotations;
}
