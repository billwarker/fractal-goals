import { describe, expect, it } from 'vitest';

import { progressGoalChart } from '../ProgressChartView';

const activity = { metric_definitions: [{ id: 'weight' }, { id: 'reps' }] };
const series = (chart_settings, condition) => ({ chart_settings, activity_definition: activity, chart: { condition } });
const rule = (metric_definition_id) => ({ metric_definition_id, operator: '>=', value: 5 });

describe('progressGoalChart', () => {
    it('sets goals from a scatter, and a trend of one metric', () => {
        expect(progressGoalChart(series({ kind: 'scatter', set_aggregation: 'average' }))).toEqual({ id: 'scatterPlot', setsHandling: 'average' });
        expect(progressGoalChart(series({ kind: 'activity_trend', metric_id: 'weight' }))).toEqual({ id: 'metricTrends', metrics: ['weight'], setsHandling: 'top' });
        expect(progressGoalChart(series({ kind: 'metric_trend', x_metric_id: 'weight' }))).toEqual({ id: 'metricTrends', metrics: ['weight'], setsHandling: 'top' });
    });

    it('sets goals from a goal’s chart of one value per session, read as it plots them', () => {
        const goal = { kind: 'goal' };
        expect(progressGoalChart(series(goal, { kind: 'single_session', measure: 'sets', rules: [rule('reps')] })))
            .toEqual({ id: 'metricTrends', metrics: ['reps'], setsHandling: 'top' });
        expect(progressGoalChart(series(goal, { kind: 'single_session', measure: 'metric', metric_definition_id: 'reps', rules: [] })))
            .toEqual({ id: 'metricTrends', metrics: ['reps'], setsHandling: 'top' });
        expect(progressGoalChart(series(goal, { kind: 'single_session', measure: 'yield', rules: [] })))
            .toEqual({ id: 'metricTrends', metrics: ['yield'], setsHandling: 'total' });
        expect(progressGoalChart(series(goal, { kind: 'single_session', measure: 'set_yield', set_aggregate: 'average', rules: [] })))
            .toEqual({ id: 'metricTrends', metrics: ['yield'], setsHandling: 'average' });
    });

    it('not from a trend of two metrics, or a goal’s chart without one value per session', () => {
        expect(progressGoalChart(series({ kind: 'metric_trend', x_metric_id: 'weight', y_metric_id: 'reps' }))).toBeNull();
        const goal = { kind: 'goal' };
        expect(progressGoalChart(series(goal, { kind: 'single_session', measure: 'sets', rules: [rule('reps'), rule('weight')] }))).toBeNull();
        expect(progressGoalChart(series(goal, { kind: 'cumulative', measure: 'metric', metric_definition_id: 'reps' }))).toBeNull();
        expect(progressGoalChart(series(goal, { kind: 'consistency', measure: 'sets', rules: [rule('reps')] }))).toBeNull();
        expect(progressGoalChart(series(goal))).toBeNull();
        expect(progressGoalChart(null)).toBeNull();
    });
});
