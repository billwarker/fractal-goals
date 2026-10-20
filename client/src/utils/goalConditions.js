// @ts-check
/**
 * Goal completion conditions: the one way a goal completes on its own.
 *
 * Pure view-model helpers shared by the condition editor, goal detail, session panels and
 * landing snapshots. Validation mirrors services/goal_condition_service.py so the editor
 * rejects what the server would reject, with the same wording.
 */

export const COMPLETION_CONDITIONS = /** @type {const} */ (['activity_threshold', 'children', 'manual']);

export const COMPLETION_CONDITION_LABELS = {
    activity_threshold: 'Activity threshold',
    children: 'All child goals',
    manual: 'Manually',
};

export const CONDITION_KINDS = {
    single_session: { label: 'Single session', measures: ['sets', 'yield'] },
    cumulative: { label: 'Cumulative', measures: ['metric', 'yield'] },
    consistency: { label: 'Consistency', measures: ['sets'] },
};

export const RULE_OPERATORS = ['>=', '>', '<=', '<', '=='];
export const TOTAL_OPERATORS = ['>=', '>', '<=', '<'];
export const OPERATOR_SYMBOLS = { '>=': '≥', '>': '>', '<=': '≤', '<': '<', '==': '=' };

const MAX_RULES = 10;
const MAX_MIN_SETS = 100;
const MAX_REQUIRED_COUNT = 10000;
const MAX_VALUE = 9999999999.9999;
export const MAX_CONDITION_NAME_LENGTH = 120;

/** @param {any} goal */
export function getGoalCompletionCondition(goal) {
    return goal?.completion_condition ?? goal?.attributes?.completion_condition ?? 'manual';
}

/** @param {any} goal */
export function getGoalCondition(goal) {
    return goal?.condition ?? goal?.attributes?.condition ?? null;
}

/**
 * What a threshold is called: the name the user gave it, otherwise its goal's name.
 * @param {any} condition
 * @param {any} goal
 */
export function conditionName(condition, goal) {
    const custom = typeof condition?.name === 'string' ? condition.name.trim() : '';
    return custom || goal?.name || goal?.attributes?.name || '';
}

/** @param {any} goal */
export function getGoalStartedAt(goal) {
    const value = goal?.started_at ?? goal?.attributes?.started_at ?? null;
    return typeof value === 'string' ? value.split('T')[0] : '';
}

/** @param {any} activity */
export function activeMetricDefinitions(activity) {
    return (activity?.metric_definitions || []).filter(
        (/** @type {any} */ metric) => !metric?.deleted_at && metric?.is_active !== false,
    );
}

/**
 * Metrics multiplied into the activity's yield (two or more, all multiplicative), as on the server.
 * @param {any} activity
 * @returns {string[]}
 */
export function yieldMetricIds(activity) {
    const metrics = activeMetricDefinitions(activity).filter(
        (/** @type {any} */ metric) => metric.track_progress !== false,
    );
    if (metrics.length < 2 || !metrics.every((/** @type {any} */ metric) => metric.is_multiplicative !== false)) {
        return [];
    }
    return [...metrics]
        .sort((a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.id).localeCompare(String(b.id)))
        .map((metric) => String(metric.id));
}

/**
 * A metric whose lower values are better (time, pace) defaults to "at most".
 * @param {any} metric
 */
export function inferOperator(metric) {
    const higherIsBetter = metric?.fractal_metric?.higher_is_better ?? metric?.higher_is_better;
    return higherIsBetter === false ? '<=' : '>=';
}

/**
 * @param {any} activity
 * @param {string} [kind]
 */
export function createConditionDraft(activity, kind = 'single_session') {
    const metrics = activeMetricDefinitions(activity);
    const firstMetric = metrics[0] || null;
    return {
        activity_definition_id: activity?.id ?? '',
        name: '',
        kind,
        measure: CONDITION_KINDS[/** @type {keyof typeof CONDITION_KINDS} */ (kind)]?.measures[0] ?? 'sets',
        min_sets: '1',
        required_count: '3',
        metric_definition_id: firstMetric?.id ?? '',
        operator: inferOperator(firstMetric),
        target_value: '',
        rules: kind === 'consistency' || !firstMetric ? [] : [{
            metric_definition_id: firstMetric.id,
            operator: inferOperator(firstMetric),
            value: '',
        }],
    };
}

/** @param {any} condition */
export function conditionToDraft(condition) {
    if (!condition) return null;
    const asText = (/** @type {any} */ value) => (value == null ? '' : String(value));
    return {
        activity_definition_id: condition.activity_definition_id ?? '',
        name: condition.name ?? '',
        kind: condition.kind ?? 'single_session',
        measure: condition.measure ?? 'sets',
        min_sets: asText(condition.min_sets ?? 1),
        required_count: asText(condition.required_count ?? 3),
        metric_definition_id: condition.metric_definition_id ?? '',
        operator: condition.operator ?? '>=',
        target_value: asText(condition.target_value),
        rules: (condition.rules || []).map((/** @type {any} */ rule) => ({
            metric_definition_id: rule.metric_definition_id,
            operator: rule.operator ?? '>=',
            value: asText(rule.value),
        })),
    };
}

/**
 * Switch a draft's kind, keeping what still applies.
 * @param {any} draft
 * @param {string} kind
 * @param {any} activity
 */
export function changeDraftKind(draft, kind, activity) {
    const measures = CONDITION_KINDS[/** @type {keyof typeof CONDITION_KINDS} */ (kind)]?.measures || ['sets'];
    const measure = measures.includes(draft.measure) ? draft.measure : measures[0];
    const fresh = createConditionDraft(activity, kind);
    return {
        ...draft,
        kind,
        measure,
        rules: measure === 'sets' && kind !== 'consistency' && draft.rules.length === 0 ? fresh.rules : draft.rules,
    };
}

/**
 * @param {any} draft
 * @param {any} activity
 */
export function changeDraftActivity(draft, activity) {
    const fresh = { ...createConditionDraft(activity, draft.kind), name: draft.name ?? '' };
    return draft.measure === 'yield' && yieldMetricIds(activity).length > 0
        ? { ...fresh, measure: 'yield', rules: [] }
        : fresh;
}

/** @param {unknown} value */
function parseNumber(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= MAX_VALUE ? number : null;
}

/** @param {unknown} value @param {number} maximum */
function parseWhole(value, maximum) {
    const number = parseNumber(value);
    return number != null && Number.isInteger(number) && number >= 1 && number <= maximum ? number : null;
}

/**
 * Field errors for an activity-threshold draft, or {} when it can be saved.
 * @param {any} draft
 * @param {any} activity
 * @returns {Record<string, string>}
 */
export function validateConditionDraft(draft, activity) {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!draft || !activity) {
        errors.activity = 'Choose an activity in this fractal';
        return errors;
    }
    if ((draft.name || '').trim().length > MAX_CONDITION_NAME_LENGTH) {
        errors.name = `Name must be at most ${MAX_CONDITION_NAME_LENGTH} characters`;
    }
    const metricsById = new Map(activeMetricDefinitions(activity).map((/** @type {any} */ metric) => [metric.id, metric]));
    const usesSets = draft.measure === 'sets';
    if (usesSets) {
        if (draft.kind === 'single_session' && draft.rules.length === 0) errors.rules = 'Add at least one metric rule';
        if (draft.rules.length > MAX_RULES) errors.rules = `Use at most ${MAX_RULES} metric rules`;
        const seen = new Set();
        draft.rules.forEach((/** @type {any} */ rule, /** @type {number} */ index) => {
            const metric = metricsById.get(rule.metric_definition_id);
            if (!metric) {
                errors[`rule-${index}`] = `Rule ${index + 1} uses a metric this activity does not track`;
            } else if (seen.has(rule.metric_definition_id)) {
                errors[`rule-${index}`] = `'${metric.name}' appears in more than one rule`;
            } else if (parseNumber(rule.value) == null) {
                errors[`rule-${index}`] = `'${metric.name}' value must be a number`;
            }
            seen.add(rule.metric_definition_id);
        });
        if (draft.kind === 'single_session' && parseWhole(draft.min_sets, MAX_MIN_SETS) == null) {
            errors.min_sets = `Sets must be between 1 and ${MAX_MIN_SETS}`;
        }
        if (draft.kind === 'consistency' && parseWhole(draft.required_count, MAX_REQUIRED_COUNT) == null) {
            errors.required_count = `Times must be between 1 and ${MAX_REQUIRED_COUNT}`;
        }
    } else {
        if (parseNumber(draft.target_value) == null) errors.target_value = 'Total must be a number';
        if (draft.measure === 'yield' && yieldMetricIds(activity).length === 0) {
            errors.measure = `'${activity.name}' has no yield (it needs two or more multiplied metrics)`;
        }
        if (draft.measure === 'metric' && !metricsById.has(draft.metric_definition_id)) {
            errors.metric = 'Choose a metric this activity tracks';
        }
    }
    return errors;
}

/**
 * The API shape for a valid draft.
 * @param {any} draft
 */
export function buildConditionPayload(draft) {
    const name = (draft.name || '').trim();
    const base = {
        activity_definition_id: draft.activity_definition_id,
        ...(name ? { name } : {}),
        kind: draft.kind,
        measure: draft.measure,
    };
    if (draft.measure === 'sets') {
        return {
            ...base,
            rules: draft.rules.map((/** @type {any} */ rule) => ({
                metric_definition_id: rule.metric_definition_id,
                operator: rule.operator,
                value: Number(rule.value),
            })),
            ...(draft.kind === 'single_session' ? { min_sets: Number(draft.min_sets) } : {}),
            ...(draft.kind === 'consistency' ? { required_count: Number(draft.required_count) } : {}),
        };
    }
    return {
        ...base,
        operator: draft.operator,
        target_value: Number(draft.target_value),
        ...(draft.measure === 'metric' ? { metric_definition_id: draft.metric_definition_id } : {}),
    };
}

/** @param {unknown} value */
export function formatConditionNumber(value) {
    const number = Number(value);
    if (value == null || value === '' || !Number.isFinite(number)) return '–';
    return Number.isInteger(number)
        ? number.toLocaleString()
        : number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * @param {any} activity
 * @param {string} metricId
 */
function metricFor(activity, metricId) {
    return activeMetricDefinitions(activity).find((/** @type {any} */ metric) => metric.id === metricId) || null;
}

/**
 * @param {{metric_definition_id: string, operator: string, value: unknown, metric_name?: string, unit?: string}} rule
 * @param {any} activity
 */
export function describeRule(rule, activity) {
    const metric = metricFor(activity, rule.metric_definition_id);
    const name = metric?.name ?? rule.metric_name ?? 'Metric';
    const unit = metric?.unit ?? rule.unit ?? '';
    const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)] ?? rule.operator;
    return `${name} ${symbol} ${formatConditionNumber(rule.value)}${unit ? ` ${unit}` : ''}`;
}

/**
 * One readable sentence for a condition, e.g. "Bench Press: 3 sets of Weight ≥ 225 lbs and Reps ≥ 6 in one session".
 * @param {any} condition
 * @param {any} [activity]
 */
export function describeCondition(condition, activity = null) {
    if (!condition) return '';
    const activityName = activity?.name ?? condition.activity_name ?? 'Activity';
    const rules = (condition.rules || []).map((/** @type {any} */ rule) => describeRule(rule, activity));
    const ruleText = rules.join(' and ');
    const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (condition.operator)] ?? condition.operator;
    let detail = '';
    if (condition.kind === 'single_session' && condition.measure === 'yield') {
        detail = `total yield ${symbol} ${formatConditionNumber(condition.target_value)} in one session`;
    } else if (condition.kind === 'single_session') {
        const sets = Number(condition.min_sets) || 1;
        detail = `${sets} ${sets === 1 ? 'set' : 'sets'} of ${ruleText || '…'} in one session`;
    } else if (condition.kind === 'cumulative' && condition.measure === 'yield') {
        detail = `total yield ${symbol} ${formatConditionNumber(condition.target_value)} across sessions`;
    } else if (condition.kind === 'cumulative') {
        const metric = metricFor(activity, condition.metric_definition_id);
        const name = metric?.name ?? condition.metric_name ?? 'total';
        const unit = metric?.unit ?? condition.metric_unit ?? '';
        detail = `${name} ${symbol} ${formatConditionNumber(condition.target_value)}${unit ? ` ${unit}` : ''} in total`;
    } else if (condition.kind === 'consistency') {
        const times = Number(condition.required_count) || 1;
        detail = `${times} ${times === 1 ? 'session' : 'sessions'}${ruleText ? ` with ${ruleText}` : ''}`;
    }
    return `${activityName}: ${detail}`;
}

/**
 * Progress as a short label, e.g. "2 / 3 sets" or "450 / 500".
 * @param {any} progress
 * @param {any} condition
 */
export function describeProgress(progress, condition) {
    if (!progress) return '';
    if (progress.completion_condition === 'children') {
        const children = progress.children || { completed: 0, total: 0 };
        return `${children.completed} / ${children.total} child goals`;
    }
    if (!condition || progress.current == null) return '';
    const current = formatConditionNumber(progress.current);
    const required = formatConditionNumber(progress.required);
    if (condition.kind === 'single_session' && condition.measure === 'sets') return `${current} / ${required} sets`;
    if (condition.kind === 'consistency') return `${current} / ${required} sessions`;
    return `${current} / ${required}`;
}

/**
 * Fraction in [0, 1] from a progress payload.
 * @param {any} progress
 */
export function progressFraction(progress) {
    const value = Number(progress?.progress);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

/**
 * How a completed goal got there, for completion views and badges.
 * @param {string | null | undefined} source
 */
export function describeCompletionSource(source) {
    switch (source) {
        case 'condition': return 'Condition met';
        case 'children': return 'All child goals complete';
        case 'manual_override': return 'Completed manually (override)';
        case 'manual': return 'Completed manually';
        default: return '';
    }
}

/**
 * A single-session draft seeded from an activity instance's best set, so "beat what I just did"
 * is one edit away. Instances without metric values seed "complete one session".
 * @param {any} instance
 * @param {any} activity
 */
export function prefillConditionFromInstance(instance, activity) {
    const metrics = activeMetricDefinitions(activity);
    /** @type {Array<Map<string, number>>} */
    const sets = ((instance?.sets || []).length > 0 ? instance.sets : [{ metrics: instance?.metrics || instance?.metric_values || [] }])
        .map((/** @type {any} */ set) => new Map(
            (set?.metrics || [])
                .map((/** @type {any} */ metric) => [metric?.metric_id || metric?.metric_definition_id, Number(metric?.value)])
                .filter((/** @type {[string, number]} */ [id, value]) => id && Number.isFinite(value)),
        ));
    const anchor = metrics.find((/** @type {any} */ metric) => metric.is_best_set_metric) || metrics[0];
    const scored = sets.filter((set) => anchor && set.has(anchor.id));
    if (!anchor || scored.length === 0) {
        return { ...createConditionDraft(activity, 'consistency'), required_count: '1' };
    }
    const higherIsBetter = inferOperator(anchor) === '>=';
    const best = scored.reduce((winner, set) => {
        const value = /** @type {number} */ (set.get(anchor.id));
        const current = /** @type {number} */ (winner.get(anchor.id));
        return (higherIsBetter ? value > current : value < current) ? set : winner;
    });
    const rules = metrics
        .filter((/** @type {any} */ metric) => best.has(metric.id))
        .slice(0, MAX_RULES)
        .map((/** @type {any} */ metric) => ({
            metric_definition_id: metric.id,
            operator: inferOperator(metric),
            value: String(best.get(metric.id)),
        }));
    return { ...createConditionDraft(activity, 'single_session'), rules };
}
