import React from 'react';

import { render, screen } from '@testing-library/react';

import ActivityTotalsChart from '../visualizations/activities/ActivityTotals/ActivityTotalsChart';

const barChart = vi.fn(() => <div>Bar Chart</div>);

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

describe('ActivityTotalsChart', () => {
    beforeEach(() => {
        barChart.mockClear();
    });

    it('renders completed activity totals with numeric duration axis, limit, and group hover metadata', () => {
        render(
            <ActivityTotalsChart
                metric="duration"
                showGroupNames
                limit={1}
                activities={[
                    { id: 'a1', name: 'Handstand Practice', group_id: 'g1' },
                    { id: 'a2', name: 'Warm Up', group_id: 'g2' },
                ]}
                activityGroups={[
                    { id: 'g1', name: 'Skill Work' },
                    { id: 'g2', name: 'Prep' },
                ]}
                activityInstances={{
                    a1: [
                        { id: 'i1', completed: true, duration_seconds: 600 },
                        { id: 'i2', completed: false, duration_seconds: 999 },
                        { id: 'i3', duration_seconds: 300 },
                    ],
                    a2: [
                        { id: 'i4', completed: true, duration_seconds: 60 },
                    ],
                }}
            />
        );

        expect(screen.getByText('Bar Chart')).toBeInTheDocument();
        expect(barChart).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                labels: ['Handstand Practice'],
                datasets: [expect.objectContaining({
                    label: 'Minutes',
                    data: [15],
                    groupNames: ['Skill Work'],
                })],
            }),
            options: expect.objectContaining({
                indexAxis: 'y',
                scales: expect.objectContaining({
                    x: expect.objectContaining({
                        type: 'linear',
                    }),
                }),
            }),
        }));

        const options = barChart.mock.calls[0][0].options;
        expect(options.plugins.tooltip.callbacks.afterTitle([{ dataset: { groupNames: ['Skill Work'] }, dataIndex: 0 }])).toEqual(['Group: Skill Work']);
        expect(options.plugins.tooltip.callbacks.label({ raw: 15 })).toBe('Duration: 15m');
    });
});
