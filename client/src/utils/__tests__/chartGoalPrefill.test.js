import { goalFromActivityTotal, goalFromMetricProgress, goalFromMetricTrend, goalFromScatterPoint } from '../chartGoalPrefill';
import { goalLineAnnotations, goalMarkers } from '../goalConditionLines';

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

    it('snaps a point to the metric’s type and precision', () => {
        const typed = {
            id: 'scales', name: 'Scales',
            metric_definitions: [
                { id: 'bpm', name: 'Tempo', unit: 'bpm', input_type: 'integer', higher_is_better: true },
                { id: 'clean', name: 'Clean', unit: '%', input_type: 'number', precision: 1, max_value: 100 },
            ],
        };
        expect(goalFromMetricTrend({ activity: typed, metricId: 'bpm', value: 119.6 }).conditionDraft.rules[0].value).toBe('120');
        const goal = goalFromMetricTrend({ activity: typed, metricId: 'clean', value: 104.37 });
        expect(goal.conditionDraft.rules[0].value).toBe('100');
        expect(goal.summary).toBe('Clean ≥ 100.0 % within one session');
    });

    it('ignores points below zero or off a known metric', () => {
        expect(goalFromMetricTrend({ activity, metricId: 'weight', value: -3 })).toBeNull();
        expect(goalFromMetricTrend({ activity, metricId: 'missing', value: 10 })).toBeNull();
    });
});

describe('goal markers', () => {
    const rule = (metric, value) => ({ metric_definition_id: metric, operator: '>=', value });
    const goal = (id, rules, kind = 'single_session') => ({ goal_id: id, goal_name: id, completed: false, condition: { kind, rules } });

    it('marks a one-rule goal on its axis, skipping cumulative totals', () => {
        const goals = [goal('a', [rule('weight', 245)]), goal('b', [], 'cumulative')];
        expect(goalMarkers(goals, { weight: 'metric1' })).toEqual([
            { key: 'a', goal: goals[0], rules: [{ scaleID: 'metric1', value: 245, symbol: '≥', metricId: 'weight' }] },
        ]);
        // The annotations only keep thresholds inside the axes; the markers draw the goal.
        const annotations = goalLineAnnotations(goals, { weight: 'metric1' });
        expect(Object.keys(annotations)).toEqual(['goal-a-weight']);
        expect(annotations['goal-a-weight']).toMatchObject({ type: 'line', scaleID: 'metric1', value: 245, borderColor: 'transparent' });
        expect(annotations['goal-a-weight'].label).toBeUndefined();
    });

    it('marks a two-rule goal only where one point shows both: a scatter plot\'s x and y', () => {
        const goals = [goal('a', [rule('weight', 245), rule('reps', 5)])];
        expect(goalMarkers(goals, { weight: 'x', reps: 'y' })[0].rules.map((item) => item.scaleID)).toEqual(['x', 'y']);
        // Metric Trends: each metric on its own value axis.
        expect(goalMarkers(goals, { weight: 'metric1', reps: 'metric2' })).toEqual([]);
        expect(goalLineAnnotations(goals, { weight: 'metric1', reps: 'metric2' })).toEqual({});
    });

    it('marks a session-yield goal on the Yield line\'s axis, and not on a chart without it', () => {
        const goals = [{ goal_id: 'y', goal_name: 'y', completed: false, condition: {
            kind: 'single_session', measure: 'yield', operator: '>=', target_value: 300, rules: [],
        } }];
        expect(goalMarkers(goals, { yield: 'metric1' }, 'total')[0].rules).toEqual([{ scaleID: 'metric1', value: 300, symbol: '≥', metricId: 'yield' }]);
        expect(goalMarkers(goals, { weight: 'metric1' }, 'total')).toEqual([]);
    });

    it('marks a yield goal only when the Yield line plots what it measures', () => {
        const yieldGoal = (id, measure, set_aggregate = 'each') => ({ goal_id: id, goal_name: id, completed: false, condition: {
            kind: 'single_session', measure, set_aggregate, operator: '>=', target_value: 300, rules: [],
        } });
        const goals = [yieldGoal('total', 'yield'), yieldGoal('best', 'set_yield'), yieldGoal('average', 'set_yield', 'average')];
        const marked = (setsHandling) => goalMarkers(goals, { yield: 'metric1' }, setsHandling).map((marker) => marker.key);
        expect(marked('top')).toEqual(['best']);
        expect(marked('average')).toEqual(['average']);
        expect(marked('total')).toEqual(['total']);
    });

    it('leaves out a goal with a rule off the chart', () => {
        const goals = [goal('a', [rule('weight', 245), rule('reps', 5)])];
        expect(goalMarkers(goals, { weight: 'metric1' })).toEqual([]);
        expect(goalMarkers(goals, { weight: 'x', tempo: 'y' })).toEqual([]);
    });
});
