import React from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import ExpandedProgressChart from '../ExpandedProgressChart';
import ProgressChart from '../ProgressChart';
import useExpandedProgressChart, { ProgressChartExpansionContext } from '../useExpandedProgressChart';

const SERIES = {
    chart: { source: 'goal_condition', goal_name: 'Front lever', condition: { measure: 'sets', rules: [{ metric_definition_id: 'm1' }] } },
    chart_settings: { kind: 'goal', set_aggregation: 'top', available: { kinds: ['goal'], metric_ids: [] } },
    activity_definition: { id: 'activity-def-1', name: 'Scales', yield_metric_ids: [] },
    instances: [{ id: 'a' }, { id: 'instance-current' }],
    current_instance_id: 'instance-current',
};
const useActivityProgressSeries = vi.fn(() => ({ data: SERIES, isLoading: false }));
const setChart = vi.fn();

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityProgressSeries: (...args) => useActivityProgressSeries(...args),
    useActivityTagCatalog: () => ({ data: { families: [], tags: [] } }),
    useProgressComparisonMutation: () => ({ setComparison: vi.fn(), isPending: false }),
    useProgressChartMutation: () => ({ setChart, isPending: false }),
}));

vi.mock('../../goalDetail/ConditionProgressChart', () => ({
    default: ({ density, instances }) => <div data-testid="progress-chart">{density}:{instances.length}</div>,
}));

vi.mock('../ProgressChartView', () => ({
    default: ({ series, density }) => (
        <div data-testid="progress-chart">{density}:{series.instances.length}:{series.chart_settings.kind}</div>
    ),
}));

const instance = {
    id: 'instance-current',
    activity_definition_id: 'activity-def-1',
    tags: [],
    comparison_context: {
        mode: 'all', tag_ids: [], tags: [], version: 1, same_template: true, same_program_day: false,
        template: { id: 'tpl', name: 'Upper' }, program_day: null,
    },
};
const choice = { mode: 'all', tagIds: [], sameTemplate: true, sameProgramDay: false };
const providers = { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false };

describe('Expanded Progress chart', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useActivityProgressSeries.mockClear();
        useActivityProgressSeries.mockImplementation(() => ({ data: SERIES, isLoading: false }));
        setChart.mockReset().mockResolvedValue({});
    });
    afterEach(() => vi.useRealTimers());

    it('fades the session out before showing the chart, and back on collapse', () => {
        const setIsMobilePaneOpen = vi.fn();
        const { result, rerender } = renderHook((props) => useExpandedProgressChart(props), {
            initialProps: { isMobile: true, sidePaneMode: 'progress', setIsMobilePaneOpen },
        });
        act(() => result.current.context.expand({ activityId: 'activity-def-1', instanceId: 'instance-current' }));
        // The content fades first; the mobile sheet steps aside.
        expect(result.current.isContentHidden).toBe(true);
        expect(result.current.activeChart).toBeNull();
        expect(setIsMobilePaneOpen).toHaveBeenLastCalledWith(false);
        act(() => vi.advanceTimersByTime(200));
        expect(result.current.activeChart).toEqual({ activityId: 'activity-def-1', instanceId: 'instance-current' });

        act(() => result.current.collapse());
        expect(result.current.isLeaving).toBe(true);
        act(() => vi.advanceTimersByTime(200));
        expect(result.current.activeChart).toBeNull();
        expect(result.current.isContentHidden).toBe(false);
        expect(setIsMobilePaneOpen).toHaveBeenLastCalledWith(true);

        // Leaving the Progress pane brings the session back, and returning doesn't reopen the chart.
        act(() => result.current.context.expand({ activityId: 'activity-def-1', instanceId: 'instance-current' }));
        act(() => vi.advanceTimersByTime(200));
        rerender({ isMobile: true, sidePaneMode: 'notes', setIsMobilePaneOpen });
        expect(result.current.isContentHidden).toBe(false);
        rerender({ isMobile: true, sidePaneMode: 'progress', setIsMobilePaneOpen });
        expect(result.current.activeChart).toBeNull();
    });

    it('expands from the pane, whose card then holds the way back', () => {
        const expansion = { chart: null, expand: vi.fn(), collapse: vi.fn() };
        const view = (value) => (
            <ProgressChartExpansionContext.Provider value={value}>
                <ProgressChart rootId="root-1" activityId="activity-def-1" instance={instance} choice={choice} />
            </ProgressChartExpansionContext.Provider>
        );
        const { rerender } = renderWithProviders(view(expansion), providers);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Goal: Front lever. Expand chart' }), { key: ' ' });
        expect(expansion.expand).toHaveBeenCalledWith({ activityId: 'activity-def-1', instanceId: 'instance-current' });

        const expanded = { ...expansion, chart: { activityId: 'activity-def-1', instanceId: 'instance-current' } };
        rerender(view(expanded));
        expect(screen.getByText('Showing in place of the session.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
        expect(expanded.collapse).toHaveBeenCalled();
    });

    it('draws the live comparison at full size, linking to Analytics; Escape closes it', () => {
        const onClose = vi.fn();
        renderWithProviders(
            <ExpandedProgressChart
                rootId="root-1"
                chart={{ activityId: 'activity-def-1', instanceId: 'instance-current' }}
                instances={[instance]}
                activityDefs={[{ id: 'activity-def-1', name: 'Scales' }]}
                onClose={onClose}
            />,
            providers,
        );
        expect(useActivityProgressSeries).toHaveBeenLastCalledWith('root-1', 'activity-def-1', {
            instanceId: 'instance-current', preview: choice,
        });
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Scales · Goal: Front lever');
        expect(screen.getByTestId('expanded-progress-chart')).toHaveTextContent('Same template');
        expect(screen.getByTestId('progress-chart')).toHaveTextContent('expanded:2:goal');
        expect(screen.getByRole('link', { name: 'Open in Analytics' })).toHaveAttribute(
            'href', '/root-1/analytics?activity=activity-def-1&viz=metricTrends&metrics=m1&template=tpl',
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('holds the chart controls while expanded: available kinds only, each change saved', () => {
        const metrics = [{ id: 'distance', name: 'Distance', unit: 'in' }, { id: 'reps', name: 'Reps', unit: '' }];
        const scatter = {
            ...SERIES,
            chart: null,
            activity_definition: { id: 'activity-def-1', name: 'Pike', has_sets: true, metric_definitions: metrics },
            chart_settings: {
                kind: 'scatter', trend_series: null, metric_id: null, x_metric_id: 'distance', y_metric_id: 'reps',
                set_aggregation: 'top', version: 3,
                available: { kinds: ['activity_trend', 'scatter', 'metric_trend'], metric_ids: ['distance', 'reps'], yield: false },
            },
        };
        useActivityProgressSeries.mockImplementation(() => ({ data: scatter, isLoading: false }));
        renderWithProviders(
            <ProgressChartExpansionContext.Provider value={{ chart: { activityId: 'activity-def-1', instanceId: 'instance-current' }, expand: vi.fn(), collapse: vi.fn() }}>
                <ProgressChart rootId="root-1" activityId="activity-def-1" instance={instance} choice={choice} />
            </ProgressChartExpansionContext.Provider>,
            providers,
        );
        const controls = screen.getByRole('group', { name: 'Chart controls' });
        const chartType = screen.getByLabelText('Chart');
        expect(chartType).toHaveValue('scatter');
        expect([...chartType.options].map((option) => option.textContent)).toEqual(['Activity trend', 'Scatter', 'Metric trend']);
        expect(controls).toHaveTextContent('X axis');
        expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();

        // Switching keeps what applies: a trend of the y metric.
        fireEvent.change(chartType, { target: { value: 'activity_trend' } });
        expect(setChart).toHaveBeenLastCalledWith({
            instanceId: 'instance-current',
            version: 3,
            settings: expect.objectContaining({ kind: 'activity_trend', trend_series: 'metric', metric_id: 'reps', set_aggregation: 'top' }),
        });
        fireEvent.change(screen.getByLabelText('Sets'), { target: { value: 'average' } });
        expect(setChart).toHaveBeenLastCalledWith(expect.objectContaining({
            settings: expect.objectContaining({ kind: 'scatter', set_aggregation: 'average' }),
        }));
    });

    it('opens a scatter in Analytics as a scatter, with its axes and set handling', () => {
        const scatter = {
            ...SERIES,
            chart_settings: {
                kind: 'scatter', x_metric_id: 'distance', y_metric_id: 'reps', set_aggregation: 'average',
                available: { kinds: ['scatter'], metric_ids: ['distance', 'reps'] },
            },
        };
        useActivityProgressSeries.mockImplementation(() => ({ data: scatter, isLoading: false }));
        renderWithProviders(
            <ExpandedProgressChart
                rootId="root-1"
                chart={{ activityId: 'activity-def-1', instanceId: 'instance-current' }}
                instances={[instance]}
                onClose={vi.fn()}
            />,
            providers,
        );
        expect(screen.getByRole('link', { name: 'Open in Analytics' })).toHaveAttribute(
            'href', '/root-1/analytics?activity=activity-def-1&viz=scatterPlot&metricX=distance&metricY=reps&sets=average&template=tpl',
        );
    });
});
