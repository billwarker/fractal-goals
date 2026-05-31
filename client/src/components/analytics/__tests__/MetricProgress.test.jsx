import React from 'react';

import { render, screen } from '@testing-library/react';

import { buildMetricProgressRows, MetricProgressChart } from '../visualizations/activities/MetricProgress';

const barChart = vi.fn(() => <div>Metric Progress Chart</div>);

vi.mock('react-chartjs-2', () => ({
    Bar: (props) => barChart(props),
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

describe('MetricProgressChart', () => {
    beforeEach(() => {
        barChart.mockClear();
    });

    it('builds percent-improvement rows from persisted progress comparisons', () => {
        expect(buildMetricProgressRows({
            selectedMetricId: 'm1',
            instances: [
                {
                    id: 'i1',
                    session_date: '2026-04-20T12:00:00Z',
                    progress_comparison: { metric_comparisons: [{ metric_id: 'm1', pct_change: 10, improved: true }] },
                },
                {
                    id: 'i2',
                    session_date: '2026-04-21T12:00:00Z',
                    progress_comparison: { metric_comparisons: [{ metric_id: 'm1', pct_change: -5, regressed: true }] },
                },
            ],
        })).toEqual([
            expect.objectContaining({ label: 'Apr 20', value: 10, improved: true }),
            expect.objectContaining({ label: 'Apr 21', value: -5, regressed: true }),
        ]);
    });

    it('renders progress bars for a progress-tracked activity', () => {
        render(
            <MetricProgressChart
                activity={{ id: 'activity-1', track_progress: true, metric_definitions: [{ id: 'm1', name: 'Weight', track_progress: true }] }}
                metric={{ id: 'm1', name: 'Weight' }}
                activityInstances={{
                    'activity-1': [
                        {
                            id: 'i1',
                            session_date: '2026-04-20T12:00:00Z',
                            progress_comparison: {
                                metric_comparisons: [{ metric_id: 'm1', metric_name: 'Weight', pct_change: 12.5, improved: true }],
                            },
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText('Metric Progress Chart')).toBeInTheDocument();
        expect(barChart).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                labels: ['Apr 20'],
                datasets: [expect.objectContaining({
                    label: '% improvement',
                    data: [12.5],
                    metricNames: ['Weight'],
                })],
            }),
        }));
    });
});
