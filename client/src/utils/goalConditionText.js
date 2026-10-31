// @ts-check
/**
 * Goal completion conditions in words: the sentence a threshold reads as and its progress label. Pure; shared by the condition
 * editor, goal details, completion modals and charts.
 */

import { OPERATOR_SYMBOLS, activeMetricDefinitions, activityUsesSets } from './goalConditions';

/**
 * The unit worth showing beside a value: none when it only repeats the metric ("Count" reps).
 * @param {any} metric
 */
export function displayUnit(metric) {
    const unit = (metric?.unit ?? '').trim();
    if (!unit || unit.toLowerCase() === 'count' || unit.toLowerCase() === (metric?.name ?? '').trim().toLowerCase()) return '';
    return unit;
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
    const unit = displayUnit({ name, unit: metric?.unit ?? rule.unit ?? '' });
    const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (rule.operator)] ?? rule.operator;
    // A value not entered yet reads as a gap to fill, not as a missing number.
    const blank = rule.value == null || rule.value === '';
    return `${name} ${symbol} ${blank ? '…' : formatConditionNumber(rule.value)}${unit ? ` ${unit}` : ''}`;
}

// Where the required tags sit in a sentence; the editor puts tag chips there, text puts names.
const TAG_SLOT = '\u0000';

/**
 * The words before a condition's tags: "tagged" or "tagged exactly".
 * @param {any} condition
 */
export function describeTagMatch(condition) {
    return condition?.tag_match === 'exact' ? 'tagged exactly' : 'tagged';
}

/**
 * A condition's sentence split around where its required tags belong, e.g.
 * ["Front Lever: average Hold ≥ 5 s across at least 3 sets", " within one session"].
 * The tags go between the parts as " tagged …" (with no tags, join the parts as they are).
 * @param {any} condition
 * @param {any} [activity]
 * @returns {[string, string]}
 */
export function describeConditionParts(condition, activity = null) {
    if (!condition) return ['', ''];
    const activityName = activity?.name ?? condition.activity_name ?? 'Activity';
    const usesSets = activityUsesSets(activity, condition);
    const rules = (condition.rules || []).map((/** @type {any} */ rule) => describeRule(rule, activity));
    const ruleText = rules.join(' and ');
    const symbol = OPERATOR_SYMBOLS[/** @type {keyof typeof OPERATOR_SYMBOLS} */ (condition.operator)] ?? condition.operator;
    const averaged = condition.set_aggregate === 'average' && usesSets;
    const sets = Number(condition.min_sets) || 1;
    const setCount = `at least ${sets} ${sets === 1 ? 'set' : 'sets'}`;
    // Tags qualify the counted sets (or, without sets, the session). Wording that only frames
    // the tags ("from sets", "with a set") appears only when there are some.
    const T = TAG_SLOT;
    const hasTags = (condition.tags || condition.tag_ids || []).length > 0;
    const fromSets = hasTags && usesSets ? ` from sets${T}` : T;
    let detail = '';
    if (condition.kind === 'single_session' && condition.measure === 'yield') {
        detail = `total yield ${symbol} ${formatConditionNumber(condition.target_value)}${fromSets} within one session`;
    } else if (condition.kind === 'single_session' && !usesSets) {
        detail = `${ruleText || '…'} within one session${T}`;
    } else if (condition.kind === 'single_session' && averaged) {
        detail = `average ${ruleText || '…'} across ${setCount}${T} within one session`;
    } else if (condition.kind === 'single_session') {
        detail = `${setCount} of ${ruleText || '…'}${T} within one session`;
    } else if (condition.kind === 'cumulative' && condition.measure === 'yield') {
        detail = `total yield ${symbol} ${formatConditionNumber(condition.target_value)}${fromSets} across sessions`;
    } else if (condition.kind === 'cumulative') {
        const metric = metricFor(activity, condition.metric_definition_id);
        const name = metric?.name ?? condition.metric_name ?? 'total';
        const unit = displayUnit({ name, unit: metric?.unit ?? condition.metric_unit ?? '' });
        detail = `${name} ${symbol} ${formatConditionNumber(condition.target_value)}${unit ? ` ${unit}` : ''} in total${fromSets}`;
    } else if (condition.kind === 'consistency') {
        const times = Number(condition.required_count) || 1;
        const streak = condition.consecutive && times > 1 ? ' in a row' : '';
        let qualifier = hasTags && usesSets ? ` with a set${T}` : T;
        if (averaged) qualifier = ` averaging ${ruleText || '…'} across ${setCount}${T}`;
        else if (ruleText) qualifier = ` with ${usesSets ? `${setCount} of ` : ''}${ruleText}${T}`;
        detail = `${times} ${times === 1 ? 'session' : 'sessions'}${streak}${qualifier}`;
    }
    const sentence = `${activityName}: ${detail}`;
    const slot = sentence.indexOf(TAG_SLOT);
    return slot < 0 ? [sentence, ''] : [sentence.slice(0, slot), sentence.slice(slot + 1)];
}

/**
 * One readable sentence for a condition, e.g.
 * "Bench Press: at least 3 sets of Weight ≥ 225 lbs tagged strength within one session".
 * @param {any} condition
 * @param {any} [activity]
 */
export function describeCondition(condition, activity = null) {
    if (!condition) return '';
    const [before, after] = describeConditionParts(condition, activity);
    const tagNames = (condition.tags || []).map((/** @type {any} */ tag) => tag?.name).filter(Boolean);
    const tagged = tagNames.length ? ` ${describeTagMatch(condition)} ${tagNames.join(', ')}` : '';
    return `${before}${tagged}${after}`;
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
    if (condition.kind === 'single_session' && condition.measure === 'sets' && condition.set_aggregate === 'average') {
        const bests = progress.rule_bests || [];
        if (bests.length === 1 && bests[0].best_average != null) {
            return `Best average ${formatConditionNumber(bests[0].best_average)} / ${formatConditionNumber(bests[0].value)}`;
        }
        return progress.met ? 'Met' : `${Math.round(Number(progress.progress || 0) * 100)}%`;
    }
    if (condition.kind === 'single_session' && condition.measure === 'sets') {
        if (activityUsesSets(null, condition)) return `${current} / ${required} sets`;
        // One implicit set per session: the count is 0 or 1, so show the closest rule instead.
        const bests = progress.rule_bests || [];
        if (bests.length === 1 && bests[0].best != null) {
            return `Best ${formatConditionNumber(bests[0].best)} / ${formatConditionNumber(bests[0].value)}`;
        }
        return progress.met ? 'Met' : 'Not met yet';
    }
    if (condition.kind === 'consistency' && condition.consecutive) {
        const best = Number(progress.best_streak);
        const bestText = !progress.met && Number.isFinite(best) && best > Number(progress.current) ? ` (best ${formatConditionNumber(best)})` : '';
        return `${current} / ${required} in a row${bestText}`;
    }
    if (condition.kind === 'consistency') return `${current} / ${required} sessions`;
    return `${current} / ${required}`;
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
