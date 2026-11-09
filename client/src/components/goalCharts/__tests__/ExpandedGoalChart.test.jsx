import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import ExpandedGoalChart from '../ExpandedGoalChart';

const chartInfo = vi.hoisted(() => ({ current: { canSetGoal: true, analyticsHref: '/root/analytics?viz=scatterPlot' } }));
const useGoalCharts = vi.hoisted(() => vi.fn());
const goalChartView = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useGoalCharts', () => ({ useGoalCharts }));
vi.mock('../GoalChartView', () => ({
    default: function GoalChartViewDouble(props) {
        goalChartView(props);
        const report = props.goalSurface.onChartInfo;
        React.useEffect(() => report(chartInfo.current), [report]);
        return <div data-testid="chart" data-annotating={String(props.goalSurface.annotating)} />;
    },
}));
vi.mock('../goalChartItems', async (original) => ({
    ...(await original()),
    buildGoalChartItems: (data) => data.items,
}));

const items = [
    { key: 'view-1', kind: 'view', name: 'Front Lever Scatter', dashboardId: 'view-1' },
    { key: 'view-2', kind: 'view', name: 'Other', dashboardId: 'view-2' },
];

const renderChart = (props = {}) => {
    const onClose = vi.fn();
    renderWithProviders(<ExpandedGoalChart rootId="root" goalId="goal" goalName="Goal" onClose={onClose} {...props} />);
    return { onClose };
};

describe('ExpandedGoalChart', () => {
    beforeEach(() => {
        chartInfo.current = { canSetGoal: true, analyticsHref: '/root/analytics?viz=scatterPlot' };
        useGoalCharts.mockReturnValue({ data: { items } });
    });

    it('offers Set goal and Open in Analytics when the chart supports them, with one title', () => {
        renderChart();
        expect(screen.getByRole('heading', { name: 'Front Lever Scatter' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Set goal/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open in Analytics' })).toHaveAttribute('href', '/root/analytics?viz=scatterPlot');
    });

    it('stays read-only for a chart that cannot set a goal', () => {
        chartInfo.current = { canSetGoal: false, analyticsHref: null };
        renderChart();
        expect(screen.queryByRole('button', { name: /Set goal/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Open in Analytics' })).not.toBeInTheDocument();
    });

    it('turns on annotate mode, and Escape does not close the chart during it', () => {
        const { onClose } = renderChart();
        fireEvent.click(screen.getByRole('button', { name: /Set goal/ }));
        expect(screen.getByTestId('chart')).toHaveAttribute('data-annotating', 'true');

        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();

        act(() => goalChartView.mock.lastCall[0].goalSurface.onAnnotatingChange(false));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
