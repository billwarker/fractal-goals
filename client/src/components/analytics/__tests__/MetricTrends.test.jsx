import React from 'react';

import { render, screen } from '@testing-library/react';

import { buildMetricTrendData, MetricTrendsChart } from '../visualizations/activities/MetricTrends';

const lineChart = vi.fn(() => <div>Metric Trends Chart</div>);

vi.mock('react-chartjs-2', () => ({
    Line: (props) => lineChart(props),
}));

vi.mock('../ChartJSWrapper', () => ({
    chartDefaults: {
        textColor: '#ddd',
        gridColor: '#333',
    },
    DISABLED_CHART_ANIMATION: {
        animation: false,
    },
}));

describe('MetricTrendsChart', () => {
    beforeEach(() => {
        lineChart.mockClear();
    });

    it('builds up to two metric line datasets from activity instances', () => {
        const data = buildMetricTrendData({
            metricDefinitions: [
                { id: 'm1', name: 'Weight', unit: 'lbs' },
                { id: 'm2', name: 'Reps', unit: 'reps' },
                { id: 'm3', name: 'Tempo', unit: 'bpm' },
            ],
            selectedMetrics: ['m1', 'm2', 'm3'],
            instances: [
                {
                    id: 'i2',
                    session_date: '2026-04-21T12:00:00Z',
                    metrics: [{ metric_id: 'm1', value: '110' }, { metric_id: 'm2', value: '6' }],
                },
                {
                    id: 'i1',
                    session_date: '2026-04-20T12:00:00Z',
                    metrics: [{ metric_id: 'm1', value: '100' }, { metric_id: 'm2', value: '5' }],
                },
            ],
        });

        expect(data.labels).toEqual(['Apr 20', 'Apr 21']);
        expect(data.datasets).toEqual([
            expect.objectContaining({ label: 'Weight', data: [100, 110], yAxisID: 'metric1' }),
            expect.objectContaining({ label: 'Reps', data: [5, 6], yAxisID: 'metric2' }),
        ]);
    });

    it('renders selected metrics on separate y axes', () => {
        render(
            <MetricTrendsChart
                activity={{ id: 'activity-1', metric_definitions: [{ id: 'm1', name: 'Weight', unit: 'lbs' }] }}
                metrics={['m1']}
                activityInstances={{
                    'activity-1': [
                        { id: 'i1', session_date: '2026-04-20T12:00:00Z', metrics: [{ metric_id: 'm1', value: '100' }] },
                    ],
                }}
            />
        );

        expect(screen.getByText('Metric Trends Chart')).toBeInTheDocument();
        expect(lineChart).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                datasets: [expect.objectContaining({ type: 'line', label: 'Weight' })],
            }),
            options: expect.objectContaining({
                scales: expect.objectContaining({
                    metric1: expect.objectContaining({ position: 'left' }),
                }),
            }),
        }));
    });
});
