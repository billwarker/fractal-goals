import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import GoalChartsCarousel from '../GoalChartsCarousel';
import ExpandedGoalChart from '../ExpandedGoalChart';
import { buildGoalChartItems, readRememberedChart } from '../goalChartItems';

const { chartsMock, detachMock, attachMock, viewsMock } = vi.hoisted(() => ({
    chartsMock: vi.fn(),
    detachMock: vi.fn(async () => true),
    attachMock: vi.fn(async () => true),
    viewsMock: vi.fn(() => ({ analyticsViewItems: [], isLoading: false })),
}));

vi.mock('../../../hooks/useGoalCharts', () => ({
    useGoalCharts: (...args) => chartsMock(...args),
    useGoalChartMutations: () => ({ attach: attachMock, detach: detachMock, isSaving: false }),
    viewAttachProblem: (view) => (view.layout?.profile?.selectedCategory === 'sessions' ? 'Session charts stay in Analytics' : null),
}));
vi.mock('../../../hooks/useDashboardQueries', () => ({ useAnalyticsViews: (...args) => viewsMock(...args) }));
vi.mock('../GoalChartView', () => ({
    default: ({ item, density }) => <div data-testid="chart-view" data-density={density}>{item?.key}</div>,
}));

const goal = {
    id: 'goal-1',
    name: 'Bench 500',
    completion_condition: 'activity_threshold',
    condition: { activity_definition_id: 'bench', kind: 'cumulative', operator: '>=', target_value: 500, metric_name: 'Reps' },
};
const view = (id, name) => ({ dashboard_id: id, name, layout: {}, category: 'activities', position: 0 });
const payload = { goal_id: 'goal-1', default_chart: 'condition_progress', charts: [view('v1', 'Bench trend'), view('v2', 'Totals')] };

function renderCarousel(props = {}) {
    return render(<GoalChartsCarousel rootId="root-1" goal={goal} goalId="goal-1" {...props} />);
}

beforeEach(() => {
    window.localStorage.clear();
    chartsMock.mockReturnValue({ data: payload, isLoading: false, isError: false });
    detachMock.mockClear();
    attachMock.mockClear();
});

describe('buildGoalChartItems', () => {
    it('puts the threshold chart first, then attached views', () => {
        const items = buildGoalChartItems(payload, goal);
        expect(items.map((item) => item.key)).toEqual(['condition_progress', 'view:v1', 'view:v2']);
        expect(items[0].name).toBe('Progress toward Bench 500');
    });

    it('names the threshold chart after the threshold when it has its own name', () => {
        const named = { ...goal, condition: { ...goal.condition, name: 'Bench volume' } };
        expect(buildGoalChartItems(payload, named)[0].name).toBe('Progress toward Bench volume');
    });

    it('has no default chart without a threshold', () => {
        expect(buildGoalChartItems({ default_chart: null, charts: [] }, goal)).toEqual([]);
    });
});

describe('GoalChartsCarousel', () => {
    it('cycles charts with the buttons and arrow keys, compact, and remembers the last one', () => {
        renderCarousel();
        expect(screen.getByTestId('chart-view')).toHaveTextContent('condition_progress');
        expect(screen.getByTestId('chart-view')).toHaveAttribute('data-density', 'compact');
        expect(screen.getByText('1 of 3')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Next chart' }));
        expect(screen.getByText('Bench trend')).toBeInTheDocument();
        expect(screen.getByText('2 of 3')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('region', { name: 'Analytics' }), { key: 'ArrowRight' });
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('region', { name: 'Analytics' }), { key: 'ArrowRight' });
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('region', { name: 'Analytics' }), { key: 'ArrowLeft' });
        expect(readRememberedChart('goal-1')).toBe('view:v2');
    });

    it('opens on the remembered chart', () => {
        window.localStorage.setItem('fractal-goals:goal-chart:goal-1', 'view:v2');
        renderCarousel();
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });

    it('removes attached views but never the default chart', () => {
        renderCarousel();
        expect(screen.queryByRole('button', { name: 'Remove from goal' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next chart' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove from goal' }));
        expect(detachMock).toHaveBeenCalledWith('v1');
    });

    it('expands by clicking the chart, only when the page supports it', () => {
        const expand = vi.fn();
        const { unmount } = renderCarousel();
        expect(screen.getByTestId('goal-chart')).not.toHaveAttribute('role');
        fireEvent.click(screen.getByTestId('chart-view'));
        unmount();

        renderCarousel({ chartExpansion: { goalId: null, expand, collapse: vi.fn() } });
        expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('chart-view'));
        expect(expand).toHaveBeenCalledWith({ goalId: 'goal-1', chartKey: 'condition_progress' });

        fireEvent.keyDown(screen.getByRole('button', { name: /^Expand chart: Progress toward/ }), { key: 'Enter' });
        expect(expand).toHaveBeenCalledTimes(2);
    });

    it('leaves clicks on controls inside the chart to them', () => {
        const expand = vi.fn();
        renderCarousel({ chartExpansion: { goalId: null, expand, collapse: vi.fn() } });
        const retry = document.createElement('button');
        screen.getByTestId('chart-view').appendChild(retry);
        fireEvent.click(retry);
        expect(expand).not.toHaveBeenCalled();
    });

    it('puts Collapse in the chart\'s place while it is expanded', () => {
        const collapse = vi.fn();
        renderCarousel({ chartExpansion: { goalId: 'goal-1', expand: vi.fn(), collapse } });
        expect(screen.queryByTestId('chart-view')).not.toBeInTheDocument();
        const placeholder = within(screen.getByTestId('goal-chart-placeholder'));
        expect(placeholder.getByText('Showing in place of the goal tree.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next chart' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Expand chart/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
        fireEvent.click(placeholder.getByRole('button', { name: 'Collapse' }));
        expect(collapse).toHaveBeenCalled();
    });

    it('adds views, hiding attached ones and disabling session views with the reason', async () => {
        viewsMock.mockReturnValue({
            isLoading: false,
            analyticsViewItems: [
                { id: 'v1', name: 'Bench trend', kind: 'view', layout: {} },
                { id: 'v3', name: 'Weekly sessions', kind: 'view', layout: { profile: { selectedCategory: 'sessions' } } },
                { id: 'v4', name: 'Squat trend', kind: 'view', layout: {} },
            ],
        });
        renderCarousel();
        fireEvent.click(screen.getByRole('button', { name: '+ Add chart' }));
        expect(screen.queryByRole('menuitem', { name: /Bench trend/ })).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Weekly sessions/ })).toBeDisabled();
        expect(screen.getByText('Session charts stay in Analytics')).toBeInTheDocument();
        await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Squat trend/ })));
        expect(attachMock).toHaveBeenCalledWith('v4');
    });

    it('prompts to add a chart when the goal has none', () => {
        chartsMock.mockReturnValue({ data: { default_chart: null, charts: [] }, isLoading: false, isError: false });
        renderCarousel();
        expect(screen.getByText('Track this goal with a saved analytics chart.')).toBeInTheDocument();
        expect(screen.queryByTestId('chart-view')).not.toBeInTheDocument();
    });
});

describe('ExpandedGoalChart', () => {
    it('shows only the chosen chart at full detail and closes on Escape', () => {
        const onClose = vi.fn();
        render(<ExpandedGoalChart rootId="root-1" goal={goal} goalId="goal-1" goalName="Bench 225" initialKey="view:v1" onClose={onClose} />);
        expect(screen.getByTestId('chart-view')).toHaveTextContent('view:v1');
        expect(screen.getByTestId('chart-view')).toHaveAttribute('data-density', 'expanded');
        expect(screen.getByRole('heading', { name: 'Bench trend' })).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps a pager and Back to goal on mobile, where goal details step aside', () => {
        const onClose = vi.fn();
        render(<ExpandedGoalChart rootId="root-1" goal={goal} goalId="goal-1" initialKey="view:v1" onClose={onClose} isMobile />);
        fireEvent.click(screen.getByRole('button', { name: 'Next chart' }));
        expect(screen.getByTestId('chart-view')).toHaveTextContent('view:v2');
        fireEvent.click(screen.getByRole('button', { name: 'Back to goal' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('follows the chart chosen in goal details', () => {
        renderCarousel({ chartExpansion: { goalId: 'goal-1', expand: vi.fn(), collapse: vi.fn() } });
        render(<ExpandedGoalChart rootId="root-1" goal={goal} goalId="goal-1" initialKey="condition_progress" onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Next chart' }));
        expect(screen.getByTestId('chart-view')).toHaveTextContent('view:v1');
    });
});
