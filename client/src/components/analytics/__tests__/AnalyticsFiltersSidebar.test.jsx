import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../hooks/useActivityTagCatalog', () => ({
    useActivityTagCatalog: () => ({ data: { families: [], tags: [
        { id: 'heavy', name: 'Heavy' }, { id: 'paused', name: 'Paused' },
    ] } }),
}));

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


describe('AnalyticsFiltersSidebar scope filters', () => {
    const sessions = [
        {
            id: 's1', template_id: 'tpl-a', template_name: 'Upper', template_color: '#ef4444',
            program_day_id: 'day-1', program_day_name: 'Day A', program_id: 'prog-1', program_name: 'Q4', program_color: '#f97316',
        },
        { id: 's2', template_id: 'tpl-b', template_name: 'Lower', program_day_id: null },
        {
            id: 's3', template_id: 'tpl-b', template_name: 'Lower',
            program_day_id: 'day-2', program_day_name: 'Day B', program_id: 'prog-1', program_name: 'Q4', program_color: '#f97316',
        },
    ];

    it('filters by tags (any or exact set), session template and program day', async () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{}} dateRange={{}} onChange={onChange} />,
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Heavy' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: { tagIds: ['heavy'], match: 'all' } }));
        // Templates and program days are picked in a modal; nothing changes until Apply.
        fireEvent.click(screen.getByRole('button', { name: 'Choose Templates' }));
        const templateModal = await screen.findByRole('dialog');
        expect(templateModal).toHaveTextContent('1 session');
        expect(templateModal).toHaveTextContent('2 sessions');
        const callsBefore = onChange.mock.calls.length;
        fireEvent.click(within(templateModal).getByRole('checkbox', { name: /Upper/ }));
        expect(onChange).toHaveBeenCalledTimes(callsBefore);
        fireEvent.click(within(templateModal).getByRole('button', { name: 'Apply' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: { templateIds: ['tpl-a'], programDayIds: [] } }));
        fireEvent.click(screen.getByRole('button', { name: 'Choose Program Days' }));
        const dayModal = await screen.findByRole('dialog');
        // Days are grouped under their program; its checkbox picks every day in it.
        const program = within(dayModal).getByRole('group', { name: 'Q4' });
        fireEvent.click(within(program).getByRole('checkbox', { name: 'All of Q4' }));
        fireEvent.click(within(program).getByRole('checkbox', { name: /Day B/ }));
        fireEvent.click(within(dayModal).getByRole('button', { name: 'Apply' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: { templateIds: [], programDayIds: ['day-1'] } }));

        rerender(<AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{ tags: { tagIds: [], match: 'exact' } }} dateRange={{}} onChange={onChange} />);
        expect(await screen.findByLabelText('Tag filter')).toHaveTextContent('Untagged');
        expect(screen.getByRole('checkbox', { name: 'Exact tag set' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Clear tags filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: null }));
    });

    it('shows scope filters only for charts they affect, or while set', async () => {
        const onChange = vi.fn();
        const goalsOnly = { 'window-1': { selectedCategory: 'goals' } };
        const { rerender } = render(
            <AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{}} dateRange={{}} onChange={onChange} windowStates={goalsOnly} />,
        );
        await screen.findByText('Activities');
        expect(screen.queryByLabelText('Tag filter')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Session template filter')).not.toBeInTheDocument();

        // A session chart brings back template and program day; tags need an activity chart.
        rerender(<AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{}} dateRange={{}} onChange={onChange} windowStates={{ 'window-1': { selectedCategory: 'sessions' } }} />);
        expect(await screen.findByLabelText('Session template filter')).toBeInTheDocument();
        expect(screen.queryByLabelText('Tag filter')).not.toBeInTheDocument();

        // A filter that's set stays, so it can be cleared.
        rerender(<AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{ tags: { tagIds: ['heavy'], match: 'all' } }} dateRange={{}} onChange={onChange} windowStates={goalsOnly} />);
        expect(await screen.findByLabelText('Tag filter')).toHaveTextContent('1 selected');
        expect(screen.queryByLabelText('Program day filter')).not.toBeInTheDocument();
    });
});
