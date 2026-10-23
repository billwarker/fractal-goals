import React from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import ExpandedProgressChart from '../ExpandedProgressChart';
import ProgressChart from '../ProgressChart';
import useExpandedProgressChart, { ProgressChartExpansionContext } from '../useExpandedProgressChart';

const SERIES = {
    chart: { source: 'goal_condition', goal_name: 'Front lever', condition: { measure: 'sets', rules: [{ metric_definition_id: 'm1' }] } },
    activity_definition: { id: 'activity-def-1', name: 'Scales', yield_metric_ids: [] },
    instances: [{ id: 'a' }, { id: 'instance-current' }],
    current_instance_id: 'instance-current',
};
const useActivityProgressSeries = vi.fn(() => ({ data: SERIES, isLoading: false }));

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityProgressSeries: (...args) => useActivityProgressSeries(...args),
    useActivityTagCatalog: () => ({ data: { families: [], tags: [] } }),
    useProgressComparisonMutation: () => ({ setComparison: vi.fn(), isPending: false }),
}));

vi.mock('../../goalDetail/ConditionProgressChart', () => ({
    default: ({ density, instances }) => <div data-testid="progress-chart">{density}:{instances.length}</div>,
}));

vi.mock('chart.js', () => ({ Chart: { register: vi.fn() } }));

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
        expect(screen.getByTestId('progress-chart')).toHaveTextContent('expanded:2');
        expect(screen.getByRole('link', { name: 'Open in Analytics' })).toHaveAttribute(
            'href', '/root-1/analytics?activity=activity-def-1&viz=metricTrends&metrics=m1&template=tpl',
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
