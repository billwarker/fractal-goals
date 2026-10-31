import { goalFromActivityTotal, goalFromMetricProgress, goalFromMetricTrend, goalFromScatterPoint } from '../chartGoalPrefill';
import { goalLineAnnotations } from '../goalConditionLines';

const activity = {
    id: 'bench',
    name: 'Bench Press',
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lb', higher_is_better: true },
        { id: 'reps', name: 'Reps', unit: 'reps', higher_is_better: true },
        { id: 'time', name: 'Time', unit: 's', higher_is_better: false },
    ],
};

describe('chart goal prefill', () => {
    it('turns a Metric Trends point into a one-session rule with the inferred operator', () => {
        const goal = goalFromMetricTrend({ activity, metricId: 'weight', value: 227.456 });
        expect(goal.summary).toBe('Weight ≥ 227.46 lb within one session');
        expect(goal.conditionDraft).toMatchObject({
            activity_definition_id: 'bench', kind: 'single_session',
            rules: [{ metric_definition_id: 'weight', operator: '>=', value: '227.46' }],
        });
        expect(goalFromMetricTrend({ activity, metricId: 'time', value: 42 }).conditionDraft.rules[0].operator).toBe('<=');
    });

    it('turns a scatter point into two rules', () => {
        const goal = goalFromScatterPoint({ activity, metricX: 'reps', x: 8, metricY: 'weight', y: 185 });
        expect(goal.conditionDraft.rules.map((rule) => [rule.metric_definition_id, rule.value])).toEqual([['reps', '8'], ['weight', '185']]);
        expect(goal.summary).toBe('Reps ≥ 8 reps, Weight ≥ 185 lb within one session');
    });

    it('reads Metric Progress as a percentage better than the latest session, in the better direction', () => {
        expect(goalFromMetricProgress({ activity, metricId: 'weight', percent: 10, latestValue: 200 }).conditionDraft.rules[0].value).toBe('220');
        expect(goalFromMetricProgress({ activity, metricId: 'time', percent: 10, latestValue: 60 }).conditionDraft.rules[0].value).toBe('54');
        expect(goalFromMetricProgress({ activity, metricId: 'weight', percent: -5, latestValue: 200 })).toBeNull();
        expect(goalFromMetricProgress({ activity, metricId: 'weight', percent: 5, latestValue: null })).toBeNull();
    });

    it('turns an instance total into a consistency goal, and nothing for time totals', () => {
        const goal = goalFromActivityTotal({ activity, measure: 'instances', value: 11.6 });
        expect(goal.conditionDraft).toMatchObject({ kind: 'consistency', required_count: '12' });
        expect(goal.summary).toBe('12 Bench Press sessions');
        expect(goalFromActivityTotal({ activity, measure: 'duration', value: 90 })).toBeNull();
    });

    it('ignores points below zero or off a known metric', () => {
        expect(goalFromMetricTrend({ activity, metricId: 'weight', value: -3 })).toBeNull();
        expect(goalFromMetricTrend({ activity, metricId: 'missing', value: 10 })).toBeNull();
    });
});

describe('goal reference lines', () => {
    it('draws each per-session rule on its metric’s axis and skips cumulative totals', () => {
        const goals = [
            { goal_id: 'a', goal_name: 'Lift 245', completed: false, condition: { kind: 'single_session', rules: [
                { metric_definition_id: 'weight', operator: '>=', value: 245 },
                { metric_definition_id: 'reps', operator: '>=', value: 5 },
            ] } },
            { goal_id: 'b', goal_name: 'Volume', completed: false, condition: { kind: 'cumulative', rules: [] } },
        ];
        const annotations = goalLineAnnotations(goals, { weight: 'metric1' });
        expect(Object.keys(annotations)).toEqual(['goal-a-weight']);
        expect(annotations['goal-a-weight']).toMatchObject({ type: 'line', scaleID: 'metric1', value: 245, label: { content: 'Lift 245 (≥ 245)' } });
    });
});
