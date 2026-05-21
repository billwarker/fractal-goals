import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AnalyticsFiltersSidebar from '../AnalyticsFiltersSidebar';

describe('AnalyticsFiltersSidebar visualization controls', () => {
    it('renders registry-selected activity controls and writes keyed state', () => {
        const onUpdateSelectedWindowState = vi.fn();
        const activity = {
            id: 'activity-1',
            name: 'Squat',
            metric_definitions: [
                { id: 'reps', name: 'Reps', unit: 'count' },
                { id: 'weight', name: 'Weight', unit: 'lbs' },
            ],
        };

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                activities={[activity]}
                activityInstances={{ 'activity-1': [] }}
                selectedWindowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'lineGraph',
                    selectedActivity: activity,
                    visualizationState: {
                        setsHandling: 'top',
                        selectedSplit: 'all',
                        metric: null,
                        metricY2: null,
                    },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.change(screen.getByLabelText('Left Axis'), {
            target: { value: 'weight' },
        });

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: expect.objectContaining({
                metric: { id: 'weight', name: 'Weight', unit: 'lbs' },
            }),
            visualizationStateByKey: expect.objectContaining({
                'activities:lineGraph': expect.objectContaining({
                    metric: { id: 'weight', name: 'Weight', unit: 'lbs' },
                }),
            }),
        }));
        expect(onUpdateSelectedWindowState.mock.calls[0][0]).not.toHaveProperty('selectedMetric');
    });

    it('renders registry-selected session controls and writes keyed state', () => {
        const onUpdateSelectedWindowState = vi.fn();

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                selectedWindowState={{
                    selectedCategory: 'sessions',
                    selectedVisualization: 'heatmap',
                    visualizationState: { months: 12 },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '6 Months' }));

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { months: 6 },
            visualizationStateByKey: {
                'sessions:heatmap': { months: 6 },
            },
        }));
        expect(onUpdateSelectedWindowState.mock.calls[0][0]).not.toHaveProperty('heatmapMonths');
    });
});
