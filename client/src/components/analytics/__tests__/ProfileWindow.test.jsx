import React from 'react';

import { render, screen } from '@testing-library/react';

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
vi.mock('../../common/ActivityModeSelector', () => ({
    default: () => <div>Mode Selector</div>,
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

    it('filters activity instances by selected mode ids before rendering charts', () => {
        render(
            <ProfileWindow
                windowId="window-1"
                data={{
                    rootId: 'root-1',
                    sessions: [],
                    goalAnalytics: { summary: {}, goals: [] },
                    activities: [{ id: 'activity-1', name: 'Bench Press', has_sets: false, has_splits: false }],
                    activityGroups: [],
                    activityInstances: {
                        'activity-1': [
                            { id: 'instance-1', modes: [{ id: 'mode-1', name: 'Strength' }] },
                            { id: 'instance-2', modes: [{ id: 'mode-2', name: 'Tempo' }] },
                        ],
                    },
                    formatDuration: (value) => String(value),
                }}
                windowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'scatterPlot',
                    selectedActivity: { id: 'activity-1', name: 'Bench Press' },
                    selectedMetric: null,
                    selectedMetricY2: null,
                    setsHandling: 'top',
                    selectedSplit: 'all',
                    selectedModeIds: ['mode-1'],
                    selectedGoal: null,
                    selectedGoalChart: 'duration',
                    heatmapMonths: 12,
                }}
                updateWindowState={vi.fn()}
                onSelect={vi.fn()}
                globalDateRange={{ start: null, end: null }}
                onGlobalDateRangeChange={vi.fn()}
            />
        );

        expect(screen.getByText('Scatter Plot')).toBeInTheDocument();
        expect(scatterPlot).toHaveBeenCalled();
        expect(scatterPlot.mock.lastCall[0].activityInstances['activity-1']).toEqual([
            { id: 'instance-1', modes: [{ id: 'mode-1', name: 'Strength' }] },
        ]);
    });
});
