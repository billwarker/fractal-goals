import React from 'react';

import { render, screen } from '@testing-library/react';

import { ActivityTrendsChart, getActivityTrendRows } from '../visualizations/activities/ActivityTrends';

const barChart = vi.fn(() => <div>Activity Trends Chart</div>);

vi.mock('react-chartjs-2', () => ({
    Bar: (props) => barChart(props),
}));

vi.mock('../ChartJSWrapper', () => ({
    useChartThemeDefaults: () => ({
        textColor: '#ddd',
        gridColor: '#333',
        primaryColor: '#4f46e5',
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

    it('aggregates completed activity instances by day for instances and duration', () => {
        expect(getActivityTrendRows({
            a1: [
                { id: 'i1', completed: true, session_date: '2026-04-20T10:00:00Z', duration_seconds: 300 },
                { id: 'i2', completed: false, session_date: '2026-04-20T11:00:00Z', duration_seconds: 999 },
                { id: 'i3', time_stop: '2026-04-21T12:00:00Z', time_start: '2026-04-21T11:45:00Z', duration_seconds: 900 },
            ],
            a2: [
                { id: 'i4', metrics: [{ metric_id: 'reps', value: 5 }], created_at: '2026-04-20T13:00:00Z' },
            ],
        })).toEqual([
            expect.objectContaining({ key: '2026-04-20', instances: 2, durationSeconds: 300 }),
            expect.objectContaining({ key: '2026-04-21', instances: 1, durationSeconds: 900 }),
        ]);
    });

    it('renders instances as bars and duration as a secondary-axis line', () => {
        render(
            <ActivityTrendsChart
                metrics={['instances', 'duration']}
                activityInstances={{
                    a1: [
                        { id: 'i1', completed: true, session_date: '2026-04-20T10:00:00Z', duration_seconds: 300 },
                        { id: 'i2', completed: true, session_date: '2026-04-21T10:00:00Z', duration_seconds: 900 },
                    ],
                }}
            />
        );

        expect(screen.getByText('Activity Trends Chart')).toBeInTheDocument();
        expect(barChart).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                labels: ['Apr 20', 'Apr 21'],
                datasets: [
                    expect.objectContaining({ type: 'bar', label: 'Instances', data: [1, 1], yAxisID: 'instances', order: 2 }),
                    expect.objectContaining({ type: 'line', label: 'Duration', data: [5, 15], yAxisID: 'duration', order: 1 }),
                ],
            }),
            options: expect.objectContaining({
                scales: expect.objectContaining({
                    instances: expect.objectContaining({ position: 'left' }),
                    duration: expect.objectContaining({ position: 'right' }),
                }),
            }),
        }));
    });
});
