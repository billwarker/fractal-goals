import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const barChart = vi.fn();
vi.mock('react-chartjs-2', () => ({
    Bar: (props) => {
        barChart(props);
        return <div data-testid="goal-time-chart" />;
    },
}));

vi.mock('../ChartJSWrapper', () => ({
    DISABLED_CHART_ANIMATION: { animation: false },
    applyChartDensity: (options) => options,
    useChartDensity: () => 'full',
    useChartThemeDefaults: () => ({
        textColor: '#ccc', gridColor: '#333', tooltipBg: '#000', tooltipText: '#fff', tooltipBody: '#ddd',
        seriesColors: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'],
        otherSeriesColor: '#999999',
    }),
}));

import GoalTimeDistribution from '../GoalTimeDistribution';

const timeRollup = {
    grain: 'week',
    first_bucket: '2026-03-02',
    last_bucket: '2026-03-16',
    breadcrumb: [],
    series: [
        { key: 'L1', goal_id: 'L1', name: 'Blues', type: 'LongTermGoal', remainder: false, drillable: true,
            buckets: [{ date: '2026-03-02', duration_seconds: 3600 }] },
        { key: 'U:other', goal_id: 'U', name: 'Guitar', type: 'UltimateGoal', remainder: true, drillable: false,
            buckets: [{ date: '2026-03-02', duration_seconds: 3600 }] },
        { key: 'L2', goal_id: 'L2', name: 'Arpeggios', type: 'LongTermGoal', remainder: false, drillable: false,
            buckets: [{ date: '2026-03-02', duration_seconds: 1800 }, { date: '2026-03-16', duration_seconds: 1800 }] },
    ],
    // Arpeggios shared a session with Blues on Mar 2, so the true total is below the stacked one.
    unique_totals: [{ date: '2026-03-02', duration_seconds: 7200 }, { date: '2026-03-16', duration_seconds: 1800 }],
};

const lastProps = () => barChart.mock.calls.at(-1)[0];

describe('GoalTimeDistribution', () => {
    beforeEach(() => barChart.mockClear());

    it('fills the whole axis and totals each session once', () => {
        render(<GoalTimeDistribution timeRollup={timeRollup} />);
        const { data, options } = lastProps();
        expect(data.datasets.map((dataset) => dataset.label)).toEqual(['Blues', 'Guitar · other', 'Arpeggios']);
        expect(data.labels).toEqual(['Mar 2', 'Mar 9', 'Mar 16']);
        expect(options.plugins.tooltip.callbacks.footer([{ dataIndex: 0 }]))
            .toEqual(['Total: 2h', 'Stacked: 2h 30m (shared sessions count for each goal)']);
        expect(options.plugins.tooltip.callbacks.footer([{ dataIndex: 2 }])).toEqual(['Total: 30m']);
        expect(screen.getByRole('button', { name: /Blues/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('hides a series from the legend and drills into a goal from the chart', () => {
        const onFocusGoal = vi.fn();
        render(<GoalTimeDistribution timeRollup={timeRollup} onFocusGoal={onFocusGoal} />);
        fireEvent.click(screen.getByRole('button', { name: /Arpeggios/ }));
        expect(lastProps().data.datasets.find((dataset) => dataset.label === 'Arpeggios').hidden).toBe(true);
        const datasets = lastProps().data.datasets;
        lastProps().options.onClick({}, [{ datasetIndex: datasets.findIndex((dataset) => dataset.label === 'Arpeggios') }]);
        expect(onFocusGoal).not.toHaveBeenCalled();
        lastProps().options.onClick({}, [{ datasetIndex: datasets.findIndex((dataset) => dataset.label === 'Blues') }]);
        expect(onFocusGoal).toHaveBeenCalledWith('L1');
    });

    it('shows a breadcrumb while focused and steps back out', () => {
        const onFocusGoal = vi.fn();
        render(<GoalTimeDistribution
            timeRollup={{ ...timeRollup, breadcrumb: [{ id: 'U', name: 'Guitar' }, { id: 'L1', name: 'Blues' }] }}
            onFocusGoal={onFocusGoal}
        />);
        fireEvent.click(screen.getByRole('button', { name: 'Guitar' }));
        expect(onFocusGoal).toHaveBeenCalledWith('U');
        fireEvent.click(screen.getByRole('button', { name: 'All goals' }));
        expect(onFocusGoal).toHaveBeenCalledWith(null);
    });

    it('says which bucket size it used, and when a finer one was too many', () => {
        const { rerender } = render(<GoalTimeDistribution timeRollup={timeRollup} />);
        expect(screen.getByText('Weekly · Mar 2 – Mar 22, 2026')).toBeInTheDocument();
        rerender(<GoalTimeDistribution timeRollup={timeRollup} requestedGrain="day" />);
        expect(screen.getByText(/Daily buckets would be too many for this range/)).toBeInTheDocument();
    });

    it('shows an empty state without a roll-up', () => {
        render(<GoalTimeDistribution timeRollup={null} />);
        expect(screen.getByText('No time recorded')).toBeInTheDocument();
    });
});
