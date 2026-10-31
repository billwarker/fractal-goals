// @ts-check
/**
 * Goal completion conditions: the one way a goal completes on its own.
 *
 * Pure view-model helpers shared by the condition editor, goal detail, session panels and
 * landing snapshots. Validation mirrors services/goal_condition_service.py so the editor
 * rejects what the server would reject, with the same wording. Wording lives in goalConditionText.js.
 */

import { yieldMetricIds } from './setAggregation';

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
export const MAX_CONDITION_TAGS = 10;
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

// Metrics multiplied into the activity's yield (lives with the set aggregation it feeds).
export { yieldMetricIds };

/**
 * Whether an activity logs sets. Activities without sets are one implicit set per session, so
 * their thresholds never talk about sets. Falls back to the serialized condition's flag.
 * @param {any} activity
 * @param {any} [condition]
 */
export function activityUsesSets(activity, condition = null) {
    const flag = activity?.has_sets ?? condition?.activity_has_sets;
    return flag !== false;
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
        tag_ids: [],
        consecutive: false,
        set_aggregate: 'each',
        tag_match: 'contains',
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
        tag_ids: [...(condition.tag_ids || (condition.tags || []).map((/** @type {any} */ tag) => tag.id))],
        consecutive: Boolean(condition.consecutive),
        set_aggregate: condition.set_aggregate === 'average' ? 'average' : 'each',
        tag_match: condition.tag_match === 'exact' ? 'exact' : 'contains',
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
        consecutive: kind === 'consistency' ? Boolean(draft.consecutive) : false,
        rules: measure === 'sets' && kind !== 'consistency' && draft.rules.length === 0 ? fresh.rules : draft.rules,
    };
}

/**
 * @param {any} draft
 * @param {any} activity
 */
export function changeDraftActivity(draft, activity) {
    // Tags belong to the fractal, not the activity, so they survive the switch.
    const fresh = {
        ...createConditionDraft(activity, draft.kind),
        name: draft.name ?? '',
        tag_ids: draft.tag_ids || [],
        consecutive: Boolean(draft.consecutive),
    };
    return draft.measure === 'yield' && yieldMetricIds(activity).length > 0
        ? { ...fresh, measure: 'yield', rules: [] }
        : fresh;
}

/**
 * Whether a draft averages each rule across a session's counted sets (rather than every set
 * meeting the rules on its own). Only sets-meeting-rules thresholds can average.
 * @param {any} draft
 */
export function averagesSets(draft) {
    return draft?.set_aggregate === 'average' && draft.measure === 'sets'
        && (draft.kind === 'single_session' || draft.kind === 'consistency');
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
    if ((draft.tag_ids || []).length > MAX_CONDITION_TAGS) {
        errors.tags = `Use at most ${MAX_CONDITION_TAGS} tags`;
    }
    const metricsById = new Map(activeMetricDefinitions(activity).map((/** @type {any} */ metric) => [metric.id, metric]));
    const usesSets = draft.measure === 'sets';
    if (usesSets) {
        const averages = averagesSets(draft);
        if (averages && !activityUsesSets(activity)) errors.measure = `'${activity.name}' logs no sets to average`;
        if ((draft.kind === 'single_session' || averages) && draft.rules.length === 0) errors.rules = 'Add at least one metric rule';
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
        const countsSets = activityUsesSets(activity) && (draft.kind === 'single_session' || draft.rules.length > 0);
        if (countsSets && parseWhole(draft.min_sets, MAX_MIN_SETS) == null) {
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
    const tagIds = [...new Set(draft.tag_ids || [])];
    const base = {
        activity_definition_id: draft.activity_definition_id,
        ...(name ? { name } : {}),
        kind: draft.kind,
        measure: draft.measure,
        ...(tagIds.length ? { tag_ids: tagIds } : {}),
        ...(tagIds.length && draft.tag_match === 'exact' ? { tag_match: 'exact' } : {}),
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
            ...(draft.kind === 'consistency' && draft.consecutive ? { consecutive: true } : {}),
            ...(draft.kind === 'consistency' && draft.rules.length > 0 ? { min_sets: Number(draft.min_sets) } : {}),
            ...(averagesSets(draft) ? { set_aggregate: 'average' } : {}),
        };
    }
    return {
        ...base,
        operator: draft.operator,
        target_value: Number(draft.target_value),
        ...(draft.measure === 'metric' ? { metric_definition_id: draft.metric_definition_id } : {}),
    };
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
