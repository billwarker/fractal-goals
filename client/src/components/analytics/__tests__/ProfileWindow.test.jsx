import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import ProfileWindow from '../ProfileWindow';

const scatterPlot = vi.fn(() => <div>Scatter Plot</div>);

vi.mock('../ScatterPlot', () => ({
    default: (props) => scatterPlot(props),
}));

vi.mock('../GoalCompletionTimeline', () => ({ default: () => <div /> }));
vi.mock('../GoalTimeDistribution', () => ({ default: () => <div /> }));
vi.mock('../StreakTimeline', () => ({ default: () => <div /> }));
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
                }}
                updateWindowState={vi.fn()}
            />
        );

        expect(screen.getByText('Metric Scatter Plot')).toBeInTheDocument();
        expect(screen.getByText('Scatter Plot')).toBeInTheDocument();
        expect(scatterPlot).toHaveBeenCalledWith(expect.objectContaining({
            selectedActivity: expect.objectContaining({ id: 'activity-1', name: 'Squat' }),
            selectedMetricX: expect.objectContaining({ id: 'reps' }),
            selectedMetricY: expect.objectContaining({ id: 'weight' }),
        }));
    });

    it('uses a single globally scoped activity as the effective activity selection', () => {
        render(
            <ProfileWindow
                data={{
                    sessions: [],
                    goalAnalytics: { goals: [], summary: {} },
                    activities: [
                        { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
                        { id: 'activity-2', name: 'Press', group_id: 'group-1' },
                    ],
                    activityGroups: [
                        { id: 'group-1', name: 'Strength', parent_id: null },
                    ],
                    activityInstances: {
                        'activity-1': [{ id: 'instance-1' }],
                        'activity-2': [{ id: 'instance-2' }],
                    },
                    formatDuration: (seconds) => `${seconds}s`,
                    rootId: null,
                }}
                windowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'scatterPlot',
                    selectedActivity: null,
                    selectedGoal: null,
                }}
                globalFilters={{
                    activities: { activityIds: ['activity-1'], groupIds: [] },
                }}
                updateWindowState={vi.fn()}
            />
        );

        expect(scatterPlot).toHaveBeenCalledWith(expect.objectContaining({
            selectedActivity: expect.objectContaining({ id: 'activity-1', name: 'Squat' }),
        }));
    });

    it('does not infer a single activity when the global scope contains multiple activities', () => {
        render(
            <ProfileWindow
                data={{
                    sessions: [],
                    goalAnalytics: { goals: [], summary: {} },
                    activities: [
                        { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
                        { id: 'activity-2', name: 'Press', group_id: 'group-1' },
                    ],
                    activityGroups: [],
                    activityInstances: {},
                    formatDuration: (seconds) => `${seconds}s`,
                    rootId: null,
                }}
                windowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'scatterPlot',
                    selectedActivity: null,
                    selectedGoal: null,
                }}
                globalFilters={{
                    activities: { activityIds: ['activity-1', 'activity-2'], groupIds: [] },
                }}
                updateWindowState={vi.fn()}
            />
        );

        expect(screen.getByText('Select an activity in the filters panel')).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('button', { name: /Activity Trends/ }));

        expect(updateWindowState).toHaveBeenCalledWith(expect.objectContaining({
            selectedVisualization: 'activityTrends',
            visualizationState: { metrics: ['instances', 'duration'] },
            visualizationStateByKey: expect.objectContaining({
                'activities:activityFrequency': { metric: 'duration', showGroups: false, limit: 8 },
                'activities:activityTrends': { metrics: ['instances', 'duration'] },
            }),
        }));
    });
});
