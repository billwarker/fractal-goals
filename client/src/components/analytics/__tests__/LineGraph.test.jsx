import React from 'react';
import { render, screen } from '@testing-library/react';

const lineSpy = vi.fn();

vi.mock('react-chartjs-2', () => ({
    Line: (props) => {
        lineSpy(props);
        return <div data-testid="line-chart" />;
    },
}));

vi.mock('../ChartJSWrapper', () => ({
    chartDefaults: {
        primaryColor: '#2255DD',
        secondaryColor: '#22AA55',
        borderColor: '#113388',
    },
    useChartOptions: () => ({
        responsive: true,
        scales: {
            x: {},
            y: {},
        },
        plugins: {},
    }),
}));

import LineGraph from '../LineGraph';

describe('LineGraph', () => {
    beforeEach(() => {
        lineSpy.mockClear();
    });

    it('uses the designated lower-is-better best-set anchor for top-set chart points', () => {
        render(
            <LineGraph
                selectedActivity={{ id: 'activity-1', name: 'Intervals' }}
                activityInstances={{
                    'activity-1': [
                        {
                            id: 'instance-1',
                            session_date: '2026-04-10T00:00:00Z',
                            session_name: 'Session A',
                            has_sets: true,
                            sets: [
                                {
                                    metrics: [
                                        { metric_id: 'm1', value: '60' },
                                        { metric_id: 'm2', value: '10' },
                                    ],
                                },
                                {
                                    metrics: [
                                        { metric_id: 'm1', value: '55' },
                                        { metric_id: 'm2', value: '8' },
                                    ],
                                },
                            ],
                        },
                    ],
                }}
                activities={[
                    {
                        id: 'activity-1',
                        name: 'Intervals',
                        has_sets: true,
                        has_splits: false,
                        metric_definitions: [
                            {
                                id: 'm1',
                                name: 'Time',
                                unit: 's',
                                is_best_set_metric: true,
                                higher_is_better: false,
                            },
                            {
                                id: 'm2',
                                name: 'Reps',
                                unit: 'reps',
                                is_best_set_metric: false,
                            },
                        ],
                        split_definitions: [],
                    },
                ]}
                selectedMetric={{ id: 'm2', name: 'Reps', unit: 'reps' }}
                setSelectedMetric={vi.fn()}
                selectedMetricY2={null}
                setSelectedMetricY2={vi.fn()}
                setsHandling="top"
                selectedSplit="all"
                chartRef={null}
                selectedDateRange={null}
                onDateRangeChange={vi.fn()}
            />
        );

        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        expect(lineSpy).toHaveBeenCalled();

        const chartProps = lineSpy.mock.lastCall[0];
        expect(chartProps.data.datasets[0].data).toEqual([
            expect.objectContaining({
                y: 8,
                set_number: 2,
            }),
        ]);
    });
});
