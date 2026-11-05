import { describe, expect, it } from 'vitest';

import { canSetGoalFromChart, readChartGoalTarget } from '../chartGoalTargets';

/** A linear scale over pixels [start, end] for values [min, max]. */
function linear(min, max, start, end) {
    const per = (end - start) / (max - min);
    return {
        getValueForPixel: (pixel) => min + (pixel - start) / per,
        getPixelForValue: (value) => start + (value - min) * per,
    };
}
/** A category scale: index i sits at start + i * step. */
function category(step, start = 0) {
    return { getValueForPixel: (pixel) => (pixel - start) / step, getPixelForValue: (index) => start + index * step };
}

const area = { left: 0, right: 400, top: 0, bottom: 200 };
function fakeChart({ scales, datasets, labels = [] }) {
    return {
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
        chartArea: area,
        scales,
        data: { datasets, labels },
        getElementsAtEventForMode: () => [{ datasetIndex: 0 }],
    };
}
const at = (x, y) => ({ clientX: x, clientY: y });

const bench = {
    id: 'bench', name: 'Bench',
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lb', input_type: 'number', precision: 1, higher_is_better: true },
        { id: 'reps', name: 'Reps', unit: 'reps', input_type: 'integer', higher_is_better: true },
    ],
};
const baseContext = (overrides = {}) => ({
    effectiveSelectedActivity: bench,
    scopedData: { activities: [bench], activityInstances: {} },
    globalFilters: { filters: { tags: null, sessions: { templateIds: [], programDayIds: [] } } },
    ...overrides,
});

describe('readChartGoalTarget', () => {
    it('snaps a Metric Trends point to the metric’s precision and places the guide on that value', () => {
        // y: 0..200 lb over 200..0 px, so pixel 79.37 reads 120.63 lb, snapping to 120.6.
        const chart = fakeChart({
            scales: { x: category(100), metric1: linear(0, 200, 200, 0) },
            datasets: [{ metricId: 'weight', yAxisID: 'metric1' }],
            labels: ['Mar 1', 'Mar 8', 'Mar 15'],
        });
        const result = readChartGoalTarget({ visualizationId: 'metricTrends', chart, nativeEvent: at(110, 79.37), context: baseContext() });
        expect(result.conditionDraft.rules[0].value).toBe('120.6');
        expect(result.guides.y).toMatchObject({ value: 120.6, label: '120.6 lb' });
        expect(result.guides.y.pixel).toBeCloseTo(79.4);
        // A rule holds in any session, so no date is on offer.
        expect(result.guides.x).toBeUndefined();
        expect(result.summary).toBe('Weight ≥ 120.6 lb within one session');
    });

    it('reads the Yield line as a goal on what it plots, with a crosshair on its axis', () => {
        const chart = fakeChart({
            scales: { x: category(100), metric1: linear(0, 400, 200, 0) },
            datasets: [{ metricId: 'yield', yAxisID: 'metric1' }],
            labels: ['Mar 1', 'Mar 8'],
        });
        const read = (setsHandling) => readChartGoalTarget({
            visualizationId: 'metricTrends', chart, nativeEvent: at(110, 100), context: baseContext({ visualizationState: { setsHandling } }),
        });
        const top = read('top');
        expect(top.guides.y).toMatchObject({ value: 200, label: '200', pixel: 100 });
        expect(top.summary).toBe('Top set yield ≥ 200 within one session');
        expect(top.conditionDraft).toMatchObject({
            kind: 'single_session', measure: 'set_yield', min_sets: '1', set_aggregate: 'each', operator: '>=', target_value: '200', rules: [],
        });
        expect(read('average').conditionDraft).toMatchObject({ measure: 'set_yield', set_aggregate: 'average' });
        expect(read('average').summary).toBe('Average set yield ≥ 200 within one session');
        expect(read('total').conditionDraft).toMatchObject({ measure: 'yield', target_value: '200' });
        expect(read('total').summary).toBe('Total yield ≥ 200 within one session');

        // Without sets, each session has one value: its total.
        const noSets = readChartGoalTarget({
            visualizationId: 'metricTrends', chart, nativeEvent: at(110, 100),
            context: baseContext({ effectiveSelectedActivity: { ...bench, has_sets: false }, visualizationState: { setsHandling: 'top' } }),
        });
        expect(noSets.conditionDraft).toMatchObject({ measure: 'yield', target_value: '200' });
    });

    it('sets no goal on Metric Trends showing more than one metric', () => {
        const chart = fakeChart({
            scales: { x: category(100), metric1: linear(0, 200, 200, 0), metric2: linear(0, 20, 200, 0) },
            datasets: [{ metricId: 'weight', yAxisID: 'metric1' }, { metricId: 'reps', yAxisID: 'metric2' }],
            labels: ['Mar 1', 'Mar 8'],
        });
        expect(readChartGoalTarget({ visualizationId: 'metricTrends', chart, nativeEvent: at(110, 100), context: baseContext() })).toBeNull();
    });

    it('offers goal setting on Metric Trends only with one metric showing', () => {
        expect(canSetGoalFromChart('metricTrends', bench, ['weight'])).toBe(true);
        expect(canSetGoalFromChart('metricTrends', bench, ['weight', 'reps'])).toBe(false);
        // With none picked, it shows an activity's first two.
        expect(canSetGoalFromChart('metricTrends', bench, [])).toBe(false);
        expect(canSetGoalFromChart('metricTrends', { metric_definitions: [bench.metric_definitions[0]] }, [])).toBe(true);
        expect(canSetGoalFromChart('scatterPlot', bench, [])).toBe(true);
        expect(canSetGoalFromChart('summary', bench, [])).toBe(false);
    });

    it('snaps both scatter axes and ignores points outside the plot', () => {
        const chart = fakeChart({
            scales: { x: linear(0, 20, 0, 400), y: linear(0, 200, 200, 0) },
            datasets: [{ metricX: 'reps', metricY: 'weight' }],
        });
        const result = readChartGoalTarget({ visualizationId: 'scatterPlot', chart, nativeEvent: at(161, 50), context: baseContext() });
        expect(result.guides.x).toMatchObject({ value: 8, label: '8 reps' });
        expect(result.guides.y).toMatchObject({ value: 150, label: '150.0 lb' });
        expect(readChartGoalTarget({ visualizationId: 'scatterPlot', chart, nativeEvent: at(500, 50), context: baseContext() })).toBeNull();
    });

    it('carries the tag filter into the goal and notes scope a condition can’t hold', () => {
        const chart = fakeChart({
            scales: { x: category(100), metric1: linear(0, 200, 200, 0) },
            datasets: [{ metricId: 'weight', yAxisID: 'metric1' }],
            labels: ['Mar 1'],
        });
        const context = baseContext({
            globalFilters: { filters: { tags: { tagIds: ['heavy'], match: 'all' }, sessions: { templateIds: ['upper'], programDayIds: [] } } },
        });
        const result = readChartGoalTarget({ visualizationId: 'metricTrends', chart, nativeEvent: at(10, 100), context });
        expect(result.conditionDraft).toMatchObject({ tag_ids: ['heavy'], tag_match: 'contains' });
        expect(result.notes).toEqual(['The template filter isn’t part of the goal condition.']);
    });

    it('reads Metric Progress as a percentage with no date, since it measures from the latest session', () => {
        const chart = fakeChart({
            scales: { x: category(100), y: linear(-50, 50, 200, 0) },
            datasets: [{ metricId: 'weight' }],
            labels: ['Mar 1', 'Mar 8'],
        });
        const result = readChartGoalTarget({ visualizationId: 'metricProgress', chart, nativeEvent: at(110, 80), context: baseContext() });
        expect(result.guides.y).toMatchObject({ label: '+10%' });
        expect(result.guides.x).toBeUndefined();
    });

    it('reads Activity Totals counts as whole times, and refuses time totals', () => {
        const chart = fakeChart({
            scales: { x: linear(0, 40, 0, 400), y: category(50, 25) },
            datasets: [{ activityIds: ['bench'], measure: 'instances' }],
            labels: ['Bench'],
        });
        const result = readChartGoalTarget({ visualizationId: 'activityFrequency', chart, nativeEvent: at(117, 30), context: baseContext() });
        expect(result.guides.x).toMatchObject({ value: 12, label: '12' });
        expect(result.conditionDraft).toMatchObject({ kind: 'consistency', required_count: '12' });

        chart.data.datasets[0].measure = 'duration';
        expect(readChartGoalTarget({ visualizationId: 'activityFrequency', chart, nativeEvent: at(117, 30), context: baseContext() }).unsupported)
            .toMatch(/Time totals/);
    });

    it('turns a future running-total point into "N more by then", and explains what it can’t do', () => {
        const runningTotal = {
            activity: bench, current: 10, todayIndex: 1, grain: 'week', bucketKeys: ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'],
        };
        const chart = fakeChart({
            scales: { x: category(100), y: linear(0, 40, 200, 0) },
            datasets: [{ runningTotal }],
            labels: ['Oct 19', 'Oct 26', 'Nov 2', 'Nov 9'],
        });
        const future = readChartGoalTarget({ visualizationId: 'activityTrends', chart, nativeEvent: at(300, 75), context: baseContext() });
        expect(future).toMatchObject({ deadline: '2026-11-15', summary: '15 more Bench sessions by Sun, Nov 15, 2026' });
        expect(future.conditionDraft).toMatchObject({ kind: 'consistency', required_count: '15' });

        expect(readChartGoalTarget({ visualizationId: 'activityTrends', chart, nativeEvent: at(100, 75), context: baseContext() }).unsupported)
            .toMatch(/future date/);
        expect(readChartGoalTarget({ visualizationId: 'activityTrends', chart, nativeEvent: at(300, 180), context: baseContext() }).unsupported)
            .toMatch(/Already done 10 times/);
        chart.data.datasets[0].runningTotal = { ...runningTotal, activity: null };
        expect(readChartGoalTarget({ visualizationId: 'activityTrends', chart, nativeEvent: at(300, 75), context: baseContext() }).unsupported)
            .toMatch(/one activity/);
        chart.data.datasets = [{}];
        expect(readChartGoalTarget({ visualizationId: 'activityTrends', chart, nativeEvent: at(300, 75), context: baseContext() }).unsupported)
            .toMatch(/Running total/);
    });
});
