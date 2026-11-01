import React from 'react';

import { render, screen } from '@testing-library/react';

import { activityTrendMeasure, ActivityTrendsChart, getActivityTrendRows } from '../visualizations/activities/ActivityTrends';

const barChart = vi.fn(() => <div>Activity Trends Chart</div>);

vi.mock('react-chartjs-2', () => ({
    Bar: (props) => barChart(props),
}));

vi.mock('../ChartJSWrapper', () => ({
    applyChartDensity: (options) => options,
    useChartDensity: () => 'full',
    useChartThemeDefaults: () => ({
        textColor: '#ddd',
        gridColor: '#333',
        primaryColor: '#4f46e5',
        seriesColors: ['#111111', '#222222', '#333333'],
        otherSeriesColor: '#999999',
        secondaryColor: '#10b981',
        borderColor: '#4f46e5',
        font: { family: 'Inter, sans-serif' },
    }),
    DISABLED_CHART_ANIMATION: {
        animation: false,
    },
}));

describe('ActivityTrendsChart', () => {
    beforeEach(() => {
        barChart.mockClear();
    });

    it('aggregates completed activity instances per day, with every day in between', () => {
        const { grain, rows } = getActivityTrendRows({
            a1: [
                { id: 'i1', completed: true, session_date: '2026-04-20T10:00:00', duration_seconds: 300 },
                { id: 'i2', completed: false, session_date: '2026-04-20T11:00:00', duration_seconds: 999 },
                { id: 'i3', time_stop: '2026-04-22T12:00:00', time_start: '2026-04-22T11:45:00', duration_seconds: 900 },
            ],
            a2: [
                { id: 'i4', metrics: [{ metric_id: 'reps', value: 5 }], created_at: '2026-04-20T13:00:00' },
            ],
        });
        expect(grain).toBe('day');
        expect(rows).toEqual([
            { key: '2026-04-20', instances: 2, durationSeconds: 300 },
            { key: '2026-04-21', instances: 0, durationSeconds: 0 },
            { key: '2026-04-22', instances: 1, durationSeconds: 900 },
        ]);
    });

    it('draws one measure on one axis: time in hours, or times done', () => {
        const instances = {
            a1: [
                { id: 'i1', completed: true, session_date: '2026-04-20T10:00:00', duration_seconds: 1800 },
                { id: 'i2', completed: true, session_date: '2026-04-21T10:00:00', duration_seconds: 3600 },
            ],
        };
        render(<ActivityTrendsChart measure="duration" activityInstances={instances} />);
        expect(screen.getByText('Activity Trends Chart')).toBeInTheDocument();
        const { data, options } = barChart.mock.calls.at(-1)[0];
        expect(data.labels).toEqual(['Apr 20', 'Apr 21']);
        expect(data.datasets).toEqual([expect.objectContaining({ label: 'Activity time', data: [0.5, 1] })]);
        expect(Object.keys(options.scales)).toEqual(['x', 'y']);
        expect(options.plugins.tooltip.callbacks.label({ dataIndex: 1 })).toBe('1h across 1 time done');

        render(<ActivityTrendsChart activityInstances={instances} />);
        expect(barChart.mock.calls.at(-1)[0].data.datasets[0]).toMatchObject({ label: 'Times done', data: [1, 1] });
    });

    it('reads an old metrics list as its first measure', () => {
        expect(activityTrendMeasure({ metrics: ['duration'] })).toBe('duration');
        expect(activityTrendMeasure({ metrics: ['instances', 'duration'] })).toBe('instances');
        expect(activityTrendMeasure({ measure: 'duration', metrics: ['instances'] })).toBe('duration');
    });

    it('stacks groups that can’t overlap and sets overlapping ones side by side, totalling each instance once', () => {
        const instances = {
            a1: [
                { id: 'i1', completed: true, session_id: 's1', session_date: '2026-04-20T10:00:00', duration_seconds: 60, tags: [{ id: 't1', name: 'Heavy' }, { id: 't2', name: 'Paused' }] },
                { id: 'i2', completed: true, session_id: 's2', session_date: '2026-04-20T11:00:00', duration_seconds: 60, tags: [] },
            ],
        };
        const lookups = {
            activitiesById: new Map([['a1', { id: 'a1', name: 'Bench' }]]),
            groupsById: new Map(),
            sessionsById: new Map([['s1', { id: 's1', template_id: 'up', template_name: 'Upper' }], ['s2', { id: 's2' }]]),
        };
        render(<ActivityTrendsChart activityInstances={instances} groupBy={{ dimension: 'template' }} lookups={lookups} />);
        let { data, options } = barChart.mock.calls.at(-1)[0];
        expect(data.datasets.map((dataset) => [dataset.label, dataset.data])).toEqual([['No template', [1]], ['Upper', [1]]]);
        expect(options.scales.y.stacked).toBe(true);
        expect(screen.getByRole('list', { name: 'Session template' })).toBeInTheDocument();

        render(<ActivityTrendsChart activityInstances={instances} groupBy={{ dimension: 'tag' }} lookups={lookups} overlap />);
        ({ data, options } = barChart.mock.calls.at(-1)[0]);
        expect(data.datasets.map((dataset) => dataset.label)).toEqual(['Heavy', 'Paused', 'Untagged']);
        expect(options.scales.y.stacked).toBe(false);
        expect(options.plugins.tooltip.callbacks.footer([{ dataIndex: 0 }])).toBe('Total: 2 times done');
        expect(screen.getByText(/count once for each tag/)).toBeInTheDocument();
    });
});

