// @ts-check
/**
 * Chart series for a goal condition's evidence, matching services/goal_condition_evaluator.py:
 * a split metric's set value is its weakest side, an instance's value is its best set, cumulative
 * conditions chart the running total, and consistency charts the running count of sessions.
 */

import { aggregateYield, evidenceSets, toNumber } from './setAggregation';

export { evidenceSets };

const MAX_RULE_SERIES = 2;

/** @param {any} instance */
export function evidenceDate(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** @param {string} operator */
const lowerIsBetter = (operator) => operator === '<=' || operator === '<';

/**
 * The instance's best value for a rule metric.
 * @param {any} instance
 * @param {string} metricId
 * @param {string} operator
 */
export function bestRuleValue(instance, metricId, operator) {
    const perSet = evidenceSets(instance)
        .map((values) => values.get(metricId))
        .filter((values) => values && values.length > 0)
        .map((values) => (lowerIsBetter(operator) ? Math.max(...values) : Math.min(...values)));
    if (perSet.length === 0) return null;
    return lowerIsBetter(operator) ? Math.min(...perSet) : Math.max(...perSet);
}

/**
 * The session's total yield (sum of its set yields), as goal conditions count it.
 * @param {any} instance
 * @param {string[]} yieldIds
 */
export function instanceYield(instance, yieldIds) {
    return aggregateYield(instance, yieldIds, 'total');
}

/**
 * @param {any} instance
 * @param {string} metricId
 */
function instanceMetricTotal(instance, metricId) {
    return evidenceSets(instance).reduce(
        (sum, values) => sum + (values.get(metricId) || []).reduce((total, value) => total + value, 0),
        0,
    );
}

/**
 * @param {any} condition
 * @param {any[]} instances
 * @param {{ metricsById?: Map<string, any>, yieldMetricIds?: string[] }} [context]
 */
export function buildConditionSeries(condition, instances, { metricsById = new Map(), yieldMetricIds = [] } = {}) {
    const ordered = [...(instances || [])]
        .map((instance) => ({ instance, date: evidenceDate(instance) }))
        .filter((row) => row.date)
        .sort((a, b) => /** @type {Date} */ (a.date).getTime() - /** @type {Date} */ (b.date).getTime());
    const points = ordered.map(({ instance, date }) => ({ instanceId: instance.id, date }));
    if (!condition) return { points, series: [] };

    if (condition.measure === 'sets' && (condition.rules || []).length > 0 && condition.kind !== 'consistency') {
        return {
            points,
            series: condition.rules.slice(0, MAX_RULE_SERIES).map((/** @type {any} */ rule) => {
                const metric = metricsById.get(rule.metric_definition_id);
                return {
                    id: rule.metric_definition_id,
                    label: metric?.name ?? rule.metric_name ?? 'Metric',
                    unit: metric?.unit ?? rule.unit ?? '',
                    threshold: toNumber(rule.value),
                    operator: rule.operator,
                    data: ordered.map(({ instance }) => bestRuleValue(instance, rule.metric_definition_id, rule.operator)),
                };
            }),
        };
    }

    if (condition.kind === 'consistency') {
        let count = 0;
        const rules = condition.rules || [];
        const data = ordered.map(({ instance }) => {
            const qualifies = rules.length === 0 || evidenceSets(instance).some((values) => rules.every((/** @type {any} */ rule) => {
                const metricValues = values.get(rule.metric_definition_id);
                return metricValues && metricValues.length > 0
                    && metricValues.every((value) => compareValue(value, rule.operator, Number(rule.value)));
            }));
            if (qualifies) count += 1;
            return count;
        });
        return {
            points,
            series: [{ id: 'count', label: 'Qualifying sessions', unit: '', threshold: toNumber(condition.required_count), operator: '>=', data }],
        };
    }

    const isYield = condition.measure === 'yield';
    const metric = metricsById.get(condition.metric_definition_id);
    const perInstance = ordered.map(({ instance }) => (
        isYield ? instanceYield(instance, yieldMetricIds) : instanceMetricTotal(instance, condition.metric_definition_id)
    ));
    let running = 0;
    const data = condition.kind === 'cumulative'
        ? perInstance.map((value) => {
            running += value || 0;
            return running;
        })
        : perInstance;
    return {
        points,
        series: [{
            id: isYield ? 'yield' : condition.metric_definition_id,
            label: isYield ? 'Total yield' : (metric?.name ?? condition.metric_name ?? 'Total'),
            unit: isYield ? '' : (metric?.unit ?? condition.metric_unit ?? ''),
            threshold: toNumber(condition.target_value),
            operator: condition.operator,
            data,
        }],
    };
}

/**
 * @param {number} actual
 * @param {string} operator
 * @param {number} threshold
 */
export function compareValue(actual, operator, threshold) {
    const tolerance = 1e-6;
    switch (operator) {
        case '>=': return actual >= threshold - tolerance;
        case '>': return actual > threshold;
        case '<=': return actual <= threshold + tolerance;
        case '<': return actual < threshold;
        case '==': return Math.abs(actual - threshold) <= tolerance;
        default: return false;
    }
}
