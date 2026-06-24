import React from 'react';
import { render } from '@testing-library/react';

import ScatterPlot from '../ScatterPlot';

const { chartMocks } = vi.hoisted(() => ({
    chartMocks: {
        scatter: vi.fn(),
    },
}));

vi.mock('react-chartjs-2', () => ({
    Scatter: (props) => {
        chartMocks.scatter(props);
        return <div data-testid="scatter-chart" />;
    },
}));

describe('ScatterPlot', () => {
    beforeEach(() => {
        chartMocks.scatter.mockClear();
    });

    it('sizes scatter points by the number of entries at the same coordinate', () => {
        const activity = { id: 'activity-1', name: 'Practice' };
        const activities = [{
            id: 'activity-1',
            name: 'Practice',
            has_metrics: true,
            metric_definitions: [
                { id: 'speed', name: 'Playback Speed', unit: '%' },
                { id: 'quality', name: 'Quality', unit: 'Rating' },
            ],
        }];
        const activityInstances = {
            'activity-1': [
                {
                    session_name: 'A',
                    session_date: '2026-06-01T00:00:00.000Z',
                    metrics: [
                        { metric_id: 'speed', value: 80 },
                        { metric_id: 'quality', value: 7 },
                    ],
                },
                {
                    session_name: 'B',
                    session_date: '2026-06-02T00:00:00.000Z',
                    metrics: [
                        { metric_id: 'speed', value: 80 },
                        { metric_id: 'quality', value: 7 },
                    ],
                },
                {
                    session_name: 'C',
                    session_date: '2026-06-03T00:00:00.000Z',
                    metrics: [
                        { metric_id: 'speed', value: 90 },
                        { metric_id: 'quality', value: 8 },
                    ],
                },
            ],
        };

        render(
            <ScatterPlot
                selectedActivity={activity}
                activityInstances={activityInstances}
                activities={activities}
                selectedMetricX="speed"
                selectedMetricY="quality"
            />
        );

        const dataset = chartMocks.scatter.mock.calls.at(-1)[0].data.datasets[0];
        expect(dataset.pointRadius).toEqual([11, 11, 8]);
        expect(dataset.pointHoverRadius).toEqual([15, 15, 12]);
        expect(dataset.data.map((point) => point.densityCount)).toEqual([2, 2, 1]);
    });

    it('keeps zero values as valid scatter coordinates', () => {
        const activity = { id: 'activity-1', name: 'Practice' };
        const activities = [{
            id: 'activity-1',
            name: 'Practice',
            has_metrics: true,
            metric_definitions: [
                { id: 'speed', name: 'Playback Speed', unit: '%' },
                { id: 'quality', name: 'Quality', unit: 'Rating' },
            ],
        }];
        const activityInstances = {
            'activity-1': [{
                session_name: 'Zero',
                session_date: '2026-06-01T00:00:00.000Z',
                metrics: [
                    { metric_id: 'speed', value: 0 },
                    { metric_id: 'quality', value: 0 },
                ],
            }],
        };

        render(
            <ScatterPlot
                selectedActivity={activity}
                activityInstances={activityInstances}
                activities={activities}
                selectedMetricX="speed"
                selectedMetricY="quality"
            />
        );

        const dataset = chartMocks.scatter.mock.calls.at(-1)[0].data.datasets[0];
        expect(dataset.data).toEqual(expect.arrayContaining([
            expect.objectContaining({ x: 0, y: 0 }),
        ]));
    });
});

