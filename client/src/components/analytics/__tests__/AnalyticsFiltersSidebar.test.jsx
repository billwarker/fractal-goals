import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AnalyticsFiltersSidebar from '../AnalyticsFiltersSidebar';

describe('AnalyticsFiltersSidebar visualization controls', () => {
    it('renders registry-selected activity trend controls and writes keyed state', () => {
        const onUpdateSelectedWindowState = vi.fn();

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                activities={[]}
                activityInstances={{ 'activity-1': [] }}
                selectedWindowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'activityTrends',
                    selectedActivity: null,
                    visualizationState: { metrics: ['instances', 'duration'] },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Duration' }));

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { metrics: ['instances'] },
            visualizationStateByKey: expect.objectContaining({
                'activities:activityTrends': { metrics: ['instances'] },
            }),
        }));
        expect(onUpdateSelectedWindowState.mock.calls[0][0]).not.toHaveProperty('selectedMetric');
    });

    it('renders session time distribution controls and writes keyed state', () => {
        const onUpdateSelectedWindowState = vi.fn();

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                selectedWindowState={{
                    selectedCategory: 'sessions',
                    selectedVisualization: 'startDistribution',
                    visualizationState: { markers: ['start'] },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Session End' }));

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { markers: ['start', 'end'] },
            visualizationStateByKey: {
                'sessions:startDistribution': { markers: ['start', 'end'] },
            },
        }));
    });

    it('renders session trend metric and grain controls', () => {
        const onUpdateSelectedWindowState = vi.fn();

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                selectedWindowState={{
                    selectedCategory: 'sessions',
                    selectedVisualization: 'sessionTrends',
                    visualizationState: { grain: 'week', metrics: ['sessions', 'duration'] },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Month' }));

        expect(screen.getByRole('button', { name: '# of sessions' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sum of Session Duration' })).toBeInTheDocument();
        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { grain: 'month', metrics: ['sessions', 'duration'] },
            visualizationStateByKey: {
                'sessions:sessionTrends': { grain: 'month', metrics: ['sessions', 'duration'] },
            },
        }));
    });

    it('renders duration histogram bucket controls', () => {
        const onUpdateSelectedWindowState = vi.fn();

        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                selectedWindowState={{
                    selectedCategory: 'sessions',
                    selectedVisualization: 'durationHistogram',
                    visualizationState: { bucketCount: 5 },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState}
            />
        );

        fireEvent.change(screen.getByLabelText('Buckets'), {
            target: { value: '30' },
        });

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { bucketCount: 30 },
            visualizationStateByKey: {
                'sessions:durationHistogram': { bucketCount: 30 },
            },
        }));
    });

    it('does not show chart-side set handling for metric progress', () => {
        render(
            <AnalyticsFiltersSidebar
                filters={{}}
                dateRange={{ start: null, end: null }}
                activities={[{
                    id: 'activity-1',
                    name: 'Holds',
                    has_sets: true,
                    metric_definitions: [{ id: 'm1', name: 'Hold Time', unit: 'seconds', track_progress: true }],
                }]}
                activityInstances={{ 'activity-1': [] }}
                selectedWindowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'metricProgress',
                    selectedActivity: { id: 'activity-1' },
                    visualizationState: { metric: null },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={vi.fn()}
            />
        );

        expect(screen.queryByLabelText('Sets')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Metric')).toBeInTheDocument();
    });

    it('pre-populates single-activity panel controls from a single global activity scope', () => {
        render(
            <AnalyticsFiltersSidebar
                filters={{
                    activities: { activityIds: ['activity-1'], groupIds: [] },
                }}
                dateRange={{ start: null, end: null }}
                activities={[
                    {
                        id: 'activity-1',
                        name: 'Holds',
                        metric_definitions: [{ id: 'm1', name: 'Hold Time', unit: 'seconds' }],
                    },
                    {
                        id: 'activity-2',
                        name: 'Pushups',
                        metric_definitions: [{ id: 'm2', name: 'Reps', unit: 'count' }],
                    },
                ]}
                activityInstances={{ 'activity-1': [], 'activity-2': [] }}
                selectedWindowState={{
                    selectedCategory: 'activities',
                    selectedVisualization: 'metricTrends',
                    selectedActivity: null,
                    visualizationState: { metrics: [] },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Holds' })).toBeInTheDocument();
        expect(screen.getByText('Choices follow global scope.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hold Time' })).toBeInTheDocument();
    });

    it('pre-populates single-goal panel controls from a single global goal scope', () => {
        render(
            <AnalyticsFiltersSidebar
                filters={{
                    goals: { goalIds: ['goal-1'], includeDescendants: false, includeInheritedActivities: true },
                }}
                dateRange={{ start: null, end: null }}
                goals={[
                    { id: 'goal-1', name: 'Front Lever', parent_id: null },
                    { id: 'goal-2', name: 'Planche', parent_id: null },
                ]}
                selectedWindowState={{
                    selectedCategory: 'goals',
                    selectedVisualization: 'goalDetail',
                    selectedGoal: null,
                    visualizationState: { chart: 'duration' },
                    visualizationStateByKey: {},
                }}
                onUpdateSelectedWindowState={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Front Lever' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Duration' })).toBeInTheDocument();
    });
});
