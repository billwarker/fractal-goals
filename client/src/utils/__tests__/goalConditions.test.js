import { describe, expect, it } from 'vitest';

import {
    buildConditionPayload,
    changeDraftActivity,
    changeDraftKind,
    conditionName,
    conditionToDraft,
    createConditionDraft,
    describeCompletionSource,
    describeCondition,
    describeProgress,
    formatConditionNumber,
    getGoalCompletionCondition,
    getGoalStartedAt,
    inferOperator,
    prefillConditionFromInstance,
    progressFraction,
    validateConditionDraft,
    yieldMetricIds,
} from '../goalConditions';

const benchPress = {
    id: 'bench',
    name: 'Bench Press',
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lbs', sort_order: 0, is_multiplicative: true, is_best_set_metric: true },
        { id: 'reps', name: 'Reps', unit: '', sort_order: 1, is_multiplicative: true },
    ],
};

const run = {
    id: 'run',
    name: 'Run',
    metric_definitions: [
        { id: 'pace', name: 'Pace', unit: 'min/km', higher_is_better: false },
    ],
};

const setsDraft = (overrides = {}) => ({
    ...createConditionDraft(benchPress),
    rules: [
        { metric_definition_id: 'weight', operator: '>=', value: '225' },
        { metric_definition_id: 'reps', operator: '>=', value: '6' },
    ],
    min_sets: '3',
    ...overrides,
});

describe('goal condition accessors', () => {
    it('defaults a goal without a condition to manual and reads started_at as a date', () => {
        expect(getGoalCompletionCondition({})).toBe('manual');
        expect(getGoalCompletionCondition({ attributes: { completion_condition: 'children' } })).toBe('children');
        expect(getGoalStartedAt({ started_at: '2026-03-01T00:00:00Z' })).toBe('2026-03-01');
        expect(getGoalStartedAt({ attributes: {} })).toBe('');
    });
});

describe('metric helpers', () => {
    it('infers "at most" only for metrics where lower is better', () => {
        expect(inferOperator(run.metric_definitions[0])).toBe('<=');
        expect(inferOperator({ fractal_metric: { higher_is_better: false } })).toBe('<=');
        expect(inferOperator(benchPress.metric_definitions[0])).toBe('>=');
        expect(inferOperator(null)).toBe('>=');
    });

    it('needs two or more multiplicative, tracked, active metrics for a yield', () => {
        expect(yieldMetricIds(benchPress)).toEqual(['weight', 'reps']);
        expect(yieldMetricIds(run)).toEqual([]);
        expect(yieldMetricIds({
            metric_definitions: [...benchPress.metric_definitions, { id: 'rpe', is_multiplicative: false }],
        })).toEqual([]);
        expect(yieldMetricIds({
            metric_definitions: [benchPress.metric_definitions[0], { ...benchPress.metric_definitions[1], deleted_at: '2026-01-01' }],
        })).toEqual([]);
    });
});

describe('drafts', () => {
    it('seeds a single-session draft with the first metric and a consistency draft without rules', () => {
        expect(createConditionDraft(run)).toEqual(expect.objectContaining({
            activity_definition_id: 'run',
            kind: 'single_session',
            measure: 'sets',
            rules: [{ metric_definition_id: 'pace', operator: '<=', value: '' }],
        }));
        expect(createConditionDraft(run, 'consistency').rules).toEqual([]);
        expect(createConditionDraft(null).activity_definition_id).toBe('');
    });

    it('round-trips a saved condition through a draft and back into the API payload', () => {
        const saved = {
            activity_definition_id: 'bench',
            kind: 'single_session',
            measure: 'sets',
            min_sets: 3,
            rules: [{ metric_definition_id: 'weight', operator: '>=', value: 225.5 }],
        };
        const draft = conditionToDraft(saved);
        expect(draft.rules[0].value).toBe('225.5');
        expect(buildConditionPayload(draft)).toEqual(saved);
        expect(conditionToDraft(null)).toBeNull();
    });

    it('carries a trimmed name into the payload, and only when one is set', () => {
        const named = conditionToDraft({ activity_definition_id: 'bench', name: 'Heavy triple', kind: 'consistency', required_count: 3 });
        expect(named.name).toBe('Heavy triple');
        expect(buildConditionPayload({ ...named, name: '  Heavy triple ' }).name).toBe('Heavy triple');
        expect(buildConditionPayload({ ...named, name: '   ' })).not.toHaveProperty('name');
        expect(changeDraftActivity(named, run).name).toBe('Heavy triple');
        expect(validateConditionDraft({ ...setsDraft(), name: 'x'.repeat(121) }, benchPress).name)
            .toBe('Name must be at most 120 characters');
    });

    it('names a condition after its goal unless it has its own name', () => {
        const goal = { name: 'Bench 225', attributes: {} };
        expect(conditionName({ name: 'Heavy triple' }, goal)).toBe('Heavy triple');
        expect(conditionName({ name: '  ' }, goal)).toBe('Bench 225');
        expect(conditionName({}, { attributes: { name: 'From attributes' } })).toBe('From attributes');
    });

    it('builds kind-specific payloads without stray fields', () => {
        expect(buildConditionPayload(setsDraft({ kind: 'consistency', required_count: '4' }))).toEqual({
            activity_definition_id: 'bench',
            kind: 'consistency',
            measure: 'sets',
            required_count: 4,
            rules: [
                { metric_definition_id: 'weight', operator: '>=', value: 225 },
                { metric_definition_id: 'reps', operator: '>=', value: 6 },
            ],
        });
        expect(buildConditionPayload(setsDraft({
            kind: 'cumulative', measure: 'metric', metric_definition_id: 'reps', operator: '>=', target_value: '500',
        }))).toEqual({
            activity_definition_id: 'bench',
            kind: 'cumulative',
            measure: 'metric',
            metric_definition_id: 'reps',
            operator: '>=',
            target_value: 500,
        });
        expect(buildConditionPayload(setsDraft({ measure: 'yield', operator: '>=', target_value: '4050' })))
            .not.toHaveProperty('metric_definition_id');
    });

    it('keeps the measure when switching kind if it still applies, otherwise takes the first allowed one', () => {
        const yieldDraft = setsDraft({ measure: 'yield' });
        expect(changeDraftKind(yieldDraft, 'cumulative', benchPress).measure).toBe('yield');
        expect(changeDraftKind(yieldDraft, 'consistency', benchPress).measure).toBe('sets');
        expect(changeDraftKind(setsDraft(), 'cumulative', benchPress).measure).toBe('metric');
        const empty = setsDraft({ kind: 'consistency', rules: [] });
        expect(changeDraftKind(empty, 'single_session', benchPress).rules).toHaveLength(1);
    });

    it('resets rules on activity change and keeps yield only when the new activity has one', () => {
        expect(changeDraftActivity(setsDraft({ measure: 'yield' }), benchPress).measure).toBe('yield');
        expect(changeDraftActivity(setsDraft({ measure: 'yield' }), run).measure).toBe('sets');
        expect(changeDraftActivity(setsDraft(), run).rules).toEqual([
            { metric_definition_id: 'pace', operator: '<=', value: '' },
        ]);
    });
});

describe('validateConditionDraft', () => {
    it('accepts a valid draft', () => {
        expect(validateConditionDraft(setsDraft(), benchPress)).toEqual({});
    });

    it('requires an activity', () => {
        expect(validateConditionDraft(setsDraft(), null)).toEqual({ activity: 'Choose an activity in this fractal' });
    });

    it('requires a rule for single-session sets but not for consistency', () => {
        expect(validateConditionDraft(setsDraft({ rules: [] }), benchPress).rules).toBe('Add at least one metric rule');
        expect(validateConditionDraft(setsDraft({ kind: 'consistency', rules: [] }), benchPress)).toEqual({});
    });

    it('rejects foreign, duplicate and non-numeric rule metrics with the server wording', () => {
        const errors = validateConditionDraft(setsDraft({
            rules: [
                { metric_definition_id: 'pace', operator: '>=', value: '1' },
                { metric_definition_id: 'weight', operator: '>=', value: 'heavy' },
                { metric_definition_id: 'weight', operator: '>=', value: '5' },
            ],
        }), benchPress);
        expect(errors['rule-0']).toBe('Rule 1 uses a metric this activity does not track');
        expect(errors['rule-1']).toBe("'Weight' value must be a number");
        expect(errors['rule-2']).toBe("'Weight' appears in more than one rule");
    });

    it('bounds sets and times at their limits', () => {
        expect(validateConditionDraft(setsDraft({ min_sets: '1' }), benchPress)).toEqual({});
        expect(validateConditionDraft(setsDraft({ min_sets: '100' }), benchPress)).toEqual({});
        expect(validateConditionDraft(setsDraft({ min_sets: '0' }), benchPress).min_sets).toBeDefined();
        expect(validateConditionDraft(setsDraft({ min_sets: '101' }), benchPress).min_sets).toBeDefined();
        expect(validateConditionDraft(setsDraft({ min_sets: '2.5' }), benchPress).min_sets).toBeDefined();
        const consistency = (count) => setsDraft({ kind: 'consistency', required_count: count });
        expect(validateConditionDraft(consistency('10000'), benchPress)).toEqual({});
        expect(validateConditionDraft(consistency('10001'), benchPress).required_count).toBeDefined();
    });

    it('accepts fractional thresholds and rejects values beyond Numeric(14,4)', () => {
        expect(validateConditionDraft(setsDraft({
            rules: [{ metric_definition_id: 'weight', operator: '>=', value: '102.5' }],
        }), benchPress)).toEqual({});
        expect(validateConditionDraft(setsDraft({
            rules: [{ metric_definition_id: 'weight', operator: '>=', value: '99999999999' }],
        }), benchPress)['rule-0']).toBe("'Weight' value must be a number");
    });

    it('checks totals, yield availability and the cumulative metric', () => {
        expect(validateConditionDraft(setsDraft({ measure: 'yield', target_value: '' }), benchPress).target_value)
            .toBe('Total must be a number');
        expect(validateConditionDraft({ ...createConditionDraft(run), measure: 'yield', target_value: '10' }, run).measure)
            .toBe("'Run' has no yield (it needs two or more multiplied metrics)");
        expect(validateConditionDraft(setsDraft({
            kind: 'cumulative', measure: 'metric', metric_definition_id: 'pace', target_value: '10',
        }), benchPress).metric).toBe('Choose a metric this activity tracks');
    });
});

describe('describing conditions and progress', () => {
    it('reads each kind as one sentence', () => {
        expect(describeCondition(buildConditionPayload(setsDraft()), benchPress))
            .toBe('Bench Press: 3 sets of Weight ≥ 225 lbs and Reps ≥ 6 in one session');
        expect(describeCondition({ kind: 'single_session', measure: 'sets', min_sets: 1, rules: [] }, benchPress))
            .toBe('Bench Press: 1 set of … in one session');
        expect(describeCondition({ kind: 'single_session', measure: 'yield', operator: '>=', target_value: 4050 }, benchPress))
            .toBe('Bench Press: total yield ≥ 4,050 in one session');
        expect(describeCondition({
            kind: 'cumulative', measure: 'metric', metric_definition_id: 'reps', operator: '>=', target_value: 500,
        }, benchPress)).toBe('Bench Press: Reps ≥ 500 in total');
        expect(describeCondition({ kind: 'consistency', required_count: 1, rules: [] }, run)).toBe('Run: 1 session');
        expect(describeCondition({
            kind: 'consistency', required_count: 4, rules: [{ metric_definition_id: 'pace', operator: '<=', value: 5.25 }],
        }, run)).toBe('Run: 4 sessions with Pace ≤ 5.25 min/km');
    });

    it('falls back to serialized names when the activity is not loaded', () => {
        expect(describeCondition({
            activity_name: 'Squat',
            kind: 'single_session',
            measure: 'sets',
            min_sets: 2,
            rules: [{ metric_definition_id: 'x', metric_name: 'Depth', unit: 'cm', operator: '==', value: 40 }],
        })).toBe('Squat: 2 sets of Depth = 40 cm in one session');
        expect(describeCondition(null)).toBe('');
    });

    it('labels progress per kind and clamps the fraction', () => {
        const condition = buildConditionPayload(setsDraft());
        expect(describeProgress({ current: 2, required: 3 }, condition)).toBe('2 / 3 sets');
        expect(describeProgress({ current: 1, required: 4 }, { kind: 'consistency' })).toBe('1 / 4 sessions');
        expect(describeProgress({ current: 450.5, required: 500 }, { kind: 'cumulative' })).toBe('450.5 / 500');
        expect(describeProgress({ completion_condition: 'children', children: { completed: 1, total: 3 } }, null))
            .toBe('1 / 3 child goals');
        expect(describeProgress(null, condition)).toBe('');
        expect(progressFraction({ progress: 1.4 })).toBe(1);
        expect(progressFraction({ progress: -0.2 })).toBe(0);
        expect(progressFraction({ progress: 'n/a' })).toBe(0);
        expect(progressFraction({ progress: 0.5 })).toBe(0.5);
    });

    it('formats numbers and completion sources', () => {
        expect(formatConditionNumber(null)).toBe('–');
        expect(formatConditionNumber('')).toBe('–');
        expect(formatConditionNumber(2.3456)).toBe('2.35');
        expect(describeCompletionSource('manual_override')).toBe('Completed manually (override)');
        expect(describeCompletionSource('condition')).toBe('Condition met');
        expect(describeCompletionSource('unknown')).toBe('');
    });
});

describe('prefillConditionFromInstance', () => {
    it('seeds rules from the best set by the best-set metric', () => {
        const draft = prefillConditionFromInstance({
            sets: [
                { metrics: [{ metric_id: 'weight', value: 185 }, { metric_id: 'reps', value: 8 }] },
                { metrics: [{ metric_id: 'weight', value: 205 }, { metric_id: 'reps', value: 5 }] },
            ],
        }, benchPress);
        expect(draft.kind).toBe('single_session');
        expect(draft.rules).toEqual([
            { metric_definition_id: 'weight', operator: '>=', value: '205' },
            { metric_definition_id: 'reps', operator: '>=', value: '5' },
        ]);
        expect(validateConditionDraft(draft, benchPress)).toEqual({});
    });

    it('picks the lowest value when lower is better and reads instance-level metrics', () => {
        const draft = prefillConditionFromInstance({
            metric_values: [{ metric_definition_id: 'pace', value: '5.1' }],
        }, run);
        expect(draft.rules).toEqual([{ metric_definition_id: 'pace', operator: '<=', value: '5.1' }]);
    });

    it('falls back to "complete one session" when the instance has no metric values', () => {
        const draft = prefillConditionFromInstance({ sets: [] }, benchPress);
        expect(draft).toEqual(expect.objectContaining({ kind: 'consistency', required_count: '1', rules: [] }));
        expect(validateConditionDraft(draft, benchPress)).toEqual({});
    });
});
