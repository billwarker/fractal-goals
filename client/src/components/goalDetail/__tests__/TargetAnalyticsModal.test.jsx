import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import TargetAnalyticsModal from '../TargetAnalyticsModal';

const { mockData, mockPreviewData, chartMocks } = vi.hoisted(() => ({
    mockData: { current: null },
    mockPreviewData: { current: null },
    chartMocks: {
        line: vi.fn(),
        scatter: vi.fn(),
    },
}));

vi.mock('../../../hooks/useTargetQueries', () => ({
    useTargetAnalytics: () => ({
        data: mockData.current,
        isLoading: false,
        error: null,
    }),
    useGoalActivityInstances: () => ({
        data: mockPreviewData.current,
        isLoading: false,
        error: null,
    }),
}));

// Chart components require a canvas; stub them out for jsdom.
vi.mock('react-chartjs-2', () => ({
    Line: (props) => {
        chartMocks.line(props);
        return <div data-testid="line-chart" />;
    },
    Scatter: (props) => {
        chartMocks.scatter(props);
        return <div data-testid="scatter-chart" />;
    },
}));

// The builder form is exercised in its own tests; stub it here.
vi.mock('../TargetManager', () => ({
    default: ({ viewMode }) => <div data-testid="target-builder">builder ({viewMode})</div>,
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    TimezoneProvider: ({ children }) => children,
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    GoalLevelsProvider: ({ children }) => children,
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
        getLevelByName: () => null,
    }),
}));

const RENDER_OPTIONS = { withTheme: false, withAuth: false, withTimezone: false };

const baseAnalytics = {
    target: {
        id: 'target-1',
        name: 'Playthrough',
        metrics: [
            { metric_definition_id: 'speed', operator: '>=', target_value: 100 },
            { metric_definition_id: 'quality', operator: '>=', target_value: 8 },
        ],
    },
    activity_definition: {
        id: 'act-1',
        name: "She's Got It",
        has_metrics: true,
        metric_definitions: [
            { id: 'speed', name: 'Playback Speed', unit: '%', min_value: 0, max_value: 100 },
            { id: 'quality', name: 'Quality', unit: 'Rating', min_value: 0, max_value: 10 },
        ],
    },
    instances: [
        {
            id: 'inst-1',
            session_name: 'Practice 1',
            session_date: '2026-05-20T10:00:00.000Z',
            created_at: '2026-05-20T10:00:00.000Z',
            metrics: [
                { metric_definition_id: 'speed', value: 95 },
                { metric_definition_id: 'quality', value: 7 },
            ],
            sets: [],
        },
    ],
    summary: {
        created_at: '2026-05-01T00:00:00.000Z',
        total_count: 1,
        last_instance_at: '2026-05-20T10:00:00.000Z',
        days_since_created: 30,
        completed: false,
        conditions: [
            { metric_definition_id: 'speed', metric_name: 'Playback Speed', unit: '%', operator: '>=', target_value: 100, best_value: 95, best_instance_id: 'inst-1', met_count: 0, first_met_at: null },
            { metric_definition_id: 'quality', metric_name: 'Quality', unit: 'Rating', operator: '>=', target_value: 8, best_value: 7, best_instance_id: 'inst-1', met_count: 0, first_met_at: null },
        ],
    },
};

describe('TargetAnalyticsModal', () => {
    beforeEach(() => {
        mockData.current = baseAnalytics;
        mockPreviewData.current = null;
        chartMocks.line.mockClear();
        chartMocks.scatter.mockClear();
        document.documentElement.style.removeProperty('--color-bg-tooltip');
        document.documentElement.style.removeProperty('--color-text-primary');
        document.documentElement.style.removeProperty('--color-text-secondary');
        document.documentElement.style.removeProperty('--color-border');
    });

    function setup() {
        return renderWithProviders(
            <TargetAnalyticsModal
                mode="view"
                rootId="root-1"
                goalId="goal-1"
                target={baseAnalytics.target}
                goalColor="#a855f7"
                activityDefinitions={[baseAnalytics.activity_definition]}
                onClose={() => {}}
            />,
            RENDER_OPTIONS
        );
    }

    function switchGraphType(type) {
        fireEvent.click(screen.getByRole('button', { name: 'Graph Type' }));
        fireEvent.click(screen.getByRole('option', { name: type }));
    }

    it('renders the target name and minimal status meta', () => {
        setup();
        expect(screen.getByText('Playthrough')).toBeInTheDocument();
        // The eyebrow now shows the activity name instead of "Target Analytics".
        expect(screen.getByText("She's Got It")).toBeInTheDocument();
        // Minimal meta line shows pending status since threshold not met
        expect(screen.getByText(/Not yet reached/i)).toBeInTheDocument();
        expect(screen.getByLabelText('Primary Metric')).toHaveValue('speed');
        expect(screen.getByLabelText('Secondary Metric')).toHaveValue('quality');
    });

    it('does not present a partially met metric as target completion', () => {
        mockData.current = {
            ...baseAnalytics,
            summary: {
                ...baseAnalytics.summary,
                completed: false,
                completed_at: null,
                conditions: [
                    {
                        ...baseAnalytics.summary.conditions[0],
                        met_count: 1,
                        first_met_at: '2026-06-17T12:00:00.000Z',
                    },
                    baseAnalytics.summary.conditions[1],
                ],
            },
        };

        setup();

        expect(screen.getByText(/Not yet reached/i)).toBeInTheDocument();
        expect(screen.queryByText(/First met/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Completed on/i)).not.toBeInTheDocument();
    });

    it('shows completed targets with a completed-on date', () => {
        mockData.current = {
            ...baseAnalytics,
            summary: {
                ...baseAnalytics.summary,
                completed: true,
                completed_at: '2026-06-17T12:00:00.000Z',
            },
        };

        setup();

        expect(screen.getByText(/Completed on .*2026/i)).toBeInTheDocument();
        expect(screen.queryByText(/First met/i)).not.toBeInTheDocument();
    });

    it('does not mark completed targets as stalled when their last instance is old', () => {
        mockData.current = {
            ...baseAnalytics,
            summary: {
                ...baseAnalytics.summary,
                completed: true,
                completed_at: '2026-06-17T12:00:00.000Z',
                last_instance_at: '2026-05-20T10:00:00.000Z',
            },
        };

        setup();

        expect(screen.getByText(/Completed on .*2026/i)).toBeInTheDocument();
        expect(screen.queryByText('Stalled')).not.toBeInTheDocument();
    });

    it('defaults to the trend chart and toggles to scatter', () => {
        setup();
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        switchGraphType('Scatter');
        expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
    });

    it('shows analytics-style metric selectors instead of metric pills', () => {
        setup();
        expect(screen.getByLabelText('Primary Metric')).toBeInTheDocument();
        expect(screen.getByLabelText('Secondary Metric')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Playback Speed' })).not.toBeInTheDocument();

        switchGraphType('Scatter');
        expect(screen.getByLabelText('X Axis')).toHaveValue('speed');
        expect(screen.getByLabelText('Y Axis')).toHaveValue('quality');
    });

    it('keeps target threshold labels separated while respecting metric axis bounds', () => {
        setup();
        const lineProps = chartMocks.line.mock.calls.at(-1)?.[0];

        expect(lineProps.options.scales.metric1).toMatchObject({ min: 0, max: 100 });
        expect(lineProps.options.scales.metric2).toMatchObject({ min: 0, max: 10 });
        expect(lineProps.options.layout.padding.right).toBe(30);
        expect(lineProps.options.scales.metric2.ticks).toMatchObject({
            display: true,
            padding: 8,
        });
        expect(lineProps.options.scales.metric1.suggestedMax).toBeUndefined();
        expect(lineProps.options.scales.metric2.suggestedMax).toBeUndefined();
        expect(lineProps.data.datasets[0]).toMatchObject({ yAxisID: 'metric1', order: 2 });
        expect(lineProps.data.datasets[1]).toMatchObject({ yAxisID: 'metric2', order: 1, data: [7] });
        expect(lineProps.options.plugins.annotation.annotations['threshold-speed']).toMatchObject({
            borderColor: '#3b82f6',
            borderDashOffset: 0,
            label: { position: 'start', xAdjust: 10 },
        });
        expect(lineProps.options.plugins.annotation.annotations['threshold-quality']).toMatchObject({
            borderColor: '#22c55e',
            borderDashOffset: 5,
            yScaleID: 'metric2',
            yMin: 8,
            yMax: 8,
            label: { position: 'end', xAdjust: -10 },
        });
    });

    it('does not collapse an unbounded secondary metric axis to zero', () => {
        mockData.current = {
            ...baseAnalytics,
            activity_definition: {
                ...baseAnalytics.activity_definition,
                metric_definitions: baseAnalytics.activity_definition.metric_definitions.map((metricDef) => ({
                    ...metricDef,
                    min_value: null,
                    max_value: null,
                })),
            },
        };

        setup();
        const lineProps = chartMocks.line.mock.calls.at(-1)?.[0];
        const secondaryScale = lineProps.options.scales.metric2;

        expect(secondaryScale.min).toBeUndefined();
        expect(secondaryScale.max).toBeUndefined();
        expect(secondaryScale.suggestedMax).toBeCloseTo(8.88);
        expect(lineProps.data.datasets[1]).toMatchObject({
            borderColor: '#22c55e',
            yAxisID: 'metric2',
            data: [7],
        });
    });

    it('uses theme colors for chart and threshold tooltips', () => {
        document.documentElement.style.setProperty('--color-bg-tooltip', 'rgb(250, 251, 252)');
        document.documentElement.style.setProperty('--color-text-primary', 'rgb(10, 20, 30)');
        document.documentElement.style.setProperty('--color-text-secondary', 'rgb(70, 80, 90)');
        document.documentElement.style.setProperty('--color-border', 'rgb(190, 200, 210)');

        setup();
        const lineProps = chartMocks.line.mock.calls.at(-1)?.[0];
        expect(lineProps.options.plugins.tooltip).toMatchObject({
            backgroundColor: 'rgb(250, 251, 252)',
            titleColor: 'rgb(10, 20, 30)',
            bodyColor: 'rgb(70, 80, 90)',
            borderColor: 'rgb(190, 200, 210)',
            borderWidth: 1,
        });
        expect(lineProps.options.plugins.annotation.annotations['threshold-speed'].label).toMatchObject({
            backgroundColor: 'rgb(250, 251, 252)',
            borderColor: 'rgb(190, 200, 210)',
            borderWidth: 1,
        });

        switchGraphType('Scatter');
        const scatterProps = chartMocks.scatter.mock.calls.at(-1)?.[0];
        expect(scatterProps.options.plugins.tooltip).toMatchObject({
            backgroundColor: 'rgb(250, 251, 252)',
            titleColor: 'rgb(10, 20, 30)',
            bodyColor: 'rgb(70, 80, 90)',
            borderColor: 'rgb(190, 200, 210)',
            borderWidth: 1,
        });
    });

    it('sizes target scatter points by coordinate density', () => {
        mockData.current = {
            ...baseAnalytics,
            instances: [
                baseAnalytics.instances[0],
                {
                    ...baseAnalytics.instances[0],
                    id: 'inst-2',
                    session_name: 'Practice 2',
                    session_date: '2026-05-21T10:00:00.000Z',
                },
                {
                    ...baseAnalytics.instances[0],
                    id: 'inst-3',
                    session_name: 'Practice 3',
                    session_date: '2026-05-22T10:00:00.000Z',
                    metrics: [
                        { metric_definition_id: 'speed', value: 90 },
                        { metric_definition_id: 'quality', value: 8 },
                    ],
                },
            ],
        };

        setup();
        switchGraphType('Scatter');

        const dataset = chartMocks.scatter.mock.calls.at(-1)[0].data.datasets[0];
        expect(dataset.pointRadius).toEqual([10, 10, 7]);
        expect(dataset.pointHoverRadius).toEqual([14, 14, 11]);
        expect(dataset.data.map((point) => point.densityCount)).toEqual([2, 2, 1]);
    });

    it('shows an empty state when there are no instances', () => {
        mockData.current = { ...baseAnalytics, instances: [], summary: { ...baseAnalytics.summary, total_count: 0 } };
        setup();
        expect(screen.getByText(/No activity recorded for this target yet/i)).toBeInTheDocument();
    });

    it('shows the header Edit (pencil) / Delete actions and switches to the builder on Edit', async () => {
        renderWithProviders(
            <TargetAnalyticsModal
                mode="view"
                rootId="root-1"
                goalId="goal-1"
                target={baseAnalytics.target}
                goalColor="#a855f7"
                targets={[baseAnalytics.target]}
                setTargets={() => {}}
                associatedActivities={[baseAnalytics.activity_definition]}
                activityDefinitions={[baseAnalytics.activity_definition]}
                onSave={() => {}}
                onDelete={() => {}}
                onClose={() => {}}
            />,
            RENDER_OPTIONS
        );
        // Edit/Delete live in the header (pencil icon + Delete), available by default.
        expect(screen.getByRole('button', { name: 'Edit target' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit target' }));
        expect(await screen.findByTestId('target-builder')).toBeInTheDocument();
    });

    it('confirms before deleting from the header Delete action', () => {
        const onDelete = vi.fn();
        const onClose = vi.fn();
        renderWithProviders(
            <TargetAnalyticsModal
                mode="view"
                rootId="root-1"
                goalId="goal-1"
                target={baseAnalytics.target}
                goalColor="#a855f7"
                targets={[baseAnalytics.target]}
                setTargets={() => {}}
                activityDefinitions={[baseAnalytics.activity_definition]}
                onDelete={onDelete}
                onClose={onClose}
            />,
            RENDER_OPTIONS
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Delete Target' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Delete Target' }));
        expect(onDelete).toHaveBeenCalledWith(baseAnalytics.target);
        expect(onClose).toHaveBeenCalled();
    });

    it('renders the builder form in the right pane in add mode', async () => {
        renderWithProviders(
            <TargetAnalyticsModal
                mode="add"
                rootId="root-1"
                goalId="goal-1"
                target={null}
                goalColor="#a855f7"
                targets={[]}
                setTargets={() => {}}
                associatedActivities={[baseAnalytics.activity_definition]}
                activityDefinitions={[baseAnalytics.activity_definition]}
                onSave={() => {}}
                onClose={() => {}}
            />,
            RENDER_OPTIONS
        );
        // Header title falls back to "New Target" until the builder emits an activity draft.
        expect(screen.getByRole('heading', { name: 'New Target' })).toBeInTheDocument();
        expect(await screen.findByTestId('target-builder')).toBeInTheDocument();
    });

    it('selects available activity metrics by default in add mode', async () => {
        mockPreviewData.current = {
            activity_definition: baseAnalytics.activity_definition,
            instances: baseAnalytics.instances,
        };

        renderWithProviders(
            <TargetAnalyticsModal
                mode="add"
                rootId="root-1"
                goalId="goal-1"
                target={null}
                goalColor="#a855f7"
                targets={[]}
                setTargets={() => {}}
                associatedActivities={[baseAnalytics.activity_definition]}
                activityDefinitions={[baseAnalytics.activity_definition]}
                initialActivityId="act-1"
                onSave={() => {}}
                onClose={() => {}}
            />,
            RENDER_OPTIONS
        );

        expect(await screen.findByTestId('line-chart')).toBeInTheDocument();
        expect(screen.queryByText('Select a metric to plot.')).not.toBeInTheDocument();
    });
});
