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

});
