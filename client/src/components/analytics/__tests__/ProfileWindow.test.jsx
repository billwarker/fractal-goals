import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import ProfileWindow from '../ProfileWindow';

const scatterPlot = vi.fn(() => <div>Scatter Plot</div>);

vi.mock('../ScatterPlot', () => ({
    default: (props) => scatterPlot(props),
}));

vi.mock('../LineGraph', () => ({ default: () => <div /> }));
vi.mock('../GoalCompletionTimeline', () => ({ default: () => <div /> }));
vi.mock('../GoalTimeDistribution', () => ({ default: () => <div /> }));
vi.mock('../ActivityHeatmap', () => ({ default: () => <div /> }));
vi.mock('../StreakTimeline', () => ({ default: () => <div /> }));
vi.mock('../WeeklyBarChart', () => ({ default: () => <div /> }));
vi.mock('react-chartjs-2', () => ({
    Bar: () => <div />,
    Line: () => <div />,
}));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#2255DD',
    }),
}));
describe('ProfileWindow', () => {
    beforeAll(() => {
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };
    });

    beforeEach(() => {
        scatterPlot.mockClear();
    });

    it('renders the selected activity scatter plot view', () => {
        render(
            <ProfileWindow
                data={{
                    sessions: [],
                    goalAnalytics: { goals: [], summary: {} },
                    activities: [
                        { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
                    ],
                    activityGroups: [
                        { id: 'group-1', name: 'Lower Body', parent_id: null },
                    ],
                    activityInstances: {
                        'activity-1': [{ id: 'instance-1' }],
                    },
                    formatDuration: (seconds) => `${seconds}s`,
                    rootId: null,
                }}
                windowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'scatterPlot',
                    selectedActivity: { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
                    selectedMetricX: { id: 'reps', name: 'Reps', unit: 'count' },
                    selectedMetricY: { id: 'weight', name: 'Weight', unit: 'lbs' },
                    selectedMetric: 'weight',
                    selectedMetricY2: null,
                    setsHandling: 'top',
                    selectedSplit: 'all',
                    selectedGoal: null,
                    selectedGoalChart: 'duration',
                    heatmapMonths: 12,
                }}
                updateWindowState={vi.fn()}
            />
        );

        expect(screen.getAllByText('Scatter Plot')).toHaveLength(2);
        expect(scatterPlot).toHaveBeenCalledWith(expect.objectContaining({
            selectedActivity: expect.objectContaining({ id: 'activity-1', name: 'Squat' }),
            selectedMetricX: expect.objectContaining({ id: 'reps' }),
            selectedMetricY: expect.objectContaining({ id: 'weight' }),
        }));
    });

    it('selects visualizations with keyed default state', () => {
        const updateWindowState = vi.fn();

        render(
            <ProfileWindow
                data={{
                    sessions: [],
                    goalAnalytics: { goals: [], summary: {} },
                    activities: [],
                    activityGroups: [],
                    activityInstances: {},
                    formatDuration: (seconds) => `${seconds}s`,
                    rootId: null,
                }}
                windowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: null,
                    selectedActivity: null,
                    selectedGoal: null,
                    visualizationState: { metric: 'duration', limit: 8 },
                    visualizationStateByKey: {
                        'activities:activityFrequency': { metric: 'duration', showGroups: false, limit: 8 },
                    },
                }}
                updateWindowState={updateWindowState}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Line Graph/ }));

        expect(updateWindowState).toHaveBeenCalledWith(expect.objectContaining({
            selectedVisualization: 'lineGraph',
            visualizationState: {
                setsHandling: 'top',
                selectedSplit: 'all',
                metric: null,
                metricY2: null,
            },
            visualizationStateByKey: expect.objectContaining({
                'activities:activityFrequency': { metric: 'duration', showGroups: false, limit: 8 },
                'activities:lineGraph': {
                    setsHandling: 'top',
                    selectedSplit: 'all',
                    metric: null,
                    metricY2: null,
                },
            }),
        }));
    });
});
