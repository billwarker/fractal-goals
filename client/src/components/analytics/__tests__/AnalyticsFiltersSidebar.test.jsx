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

        fireEvent.click(screen.getByRole('button', { name: 'Time' }));

        expect(onUpdateSelectedWindowState).toHaveBeenCalledWith(expect.objectContaining({
            visualizationState: { grain: 'auto', metrics: ['instances', 'duration'], measure: 'duration' },
            visualizationStateByKey: expect.objectContaining({
                'activities:activityTrends': { grain: 'auto', metrics: ['instances', 'duration'], measure: 'duration' },
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

    it('renders session trend measure and grain controls', () => {
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

        // One measure at a time (no second y-axis); an old metrics list shows its first.
        expect(screen.getByRole('button', { name: 'Sessions' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Time' })).toHaveAttribute('aria-pressed', 'false');
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
        expect(screen.getByText('Choices follow this chart’s scope.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hold Time' })).toBeInTheDocument();
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
        // Tags, template and program day start under "Add filters".
        expect(screen.queryByLabelText('Tag filter')).not.toBeInTheDocument();
        const additional = screen.getByRole('list', { name: 'Additional filters' });
        ['Tags', 'Session template', 'Program day'].forEach((name) => fireEvent.click(within(additional).getByRole('button', { name })));
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
        const tagDetails = await screen.findByRole('button', { name: 'View tags filter selections' });
        fireEvent.focus(tagDetails);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Untagged');
        fireEvent.blur(tagDetails);
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
        expect(screen.queryByRole('heading', { name: 'Time Range' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Tag filter')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Session template filter')).not.toBeInTheDocument();

        // A session chart offers template and program day under Add filters; tags need an activity chart.
        rerender(<AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{}} dateRange={{}} onChange={onChange} windowStates={{ 'window-1': { selectedCategory: 'sessions' } }} />);
        expect(screen.queryByLabelText('Session template filter')).not.toBeInTheDocument();
        const additional = screen.getByRole('list', { name: 'Additional filters' });
        expect(within(additional).queryByRole('button', { name: 'Tags' })).not.toBeInTheDocument();
        fireEvent.click(within(additional).getByRole('button', { name: 'Session template' }));
        expect(await screen.findByLabelText('Session template filter')).toBeInTheDocument();

        // A filter that's set stays, so it can be cleared.
        rerender(<AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{ tags: { tagIds: ['heavy'], match: 'all' } }} dateRange={{}} onChange={onChange} windowStates={goalsOnly} />);
        const tagDetails = await screen.findByRole('button', { name: 'View tags filter selections' });
        fireEvent.focus(tagDetails);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Heavy');
        fireEvent.blur(tagDetails);
        expect(screen.queryByLabelText('Program day filter')).not.toBeInTheDocument();
    });

    it('starts with optional filters above chart controls', async () => {
        const onUpdateSelectedWindowState = vi.fn();
        const activityChart = {
            selectedCategory: 'activities', selectedVisualization: 'activityTrends',
            visualizationState: {}, visualizationStateByKey: {},
        };
        render(
            <AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={{}} dateRange={{}}
                selectedWindowState={activityChart} windowStates={{ w: activityChart }}
                onUpdateSelectedWindowState={onUpdateSelectedWindowState} />,
        );
        expect(screen.queryByText('Add Filters')).not.toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Additional filters' })).toBeVisible();
        const groupTitles = [...document.querySelectorAll('.sessions-query-section-group-title')].map((node) => node.textContent);
        expect(groupTitles).toEqual(['Filters', 'Chart', 'Group by']);
        expect(screen.queryByRole('heading', { name: 'Time Range' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Activities' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Tag filter')).not.toBeInTheDocument();

        const filterHeader = document.querySelector('.sessions-query-section-group-title').parentElement;
        fireEvent.click(within(filterHeader).getByRole('button', { name: 'Hide' }));
        expect(screen.queryByRole('list', { name: 'Additional filters' })).not.toBeInTheDocument();
        fireEvent.click(within(filterHeader).getByRole('button', { name: 'Show' }));
        expect(screen.getByRole('list', { name: 'Additional filters' })).toBeVisible();
        fireEvent.click(within(screen.getByRole('list', { name: 'Additional filters' })).getByRole('button', { name: 'Tags' }));
        expect(within(filterHeader).getByRole('button', { name: 'Hide' })).toBeVisible();
        expect(onUpdateSelectedWindowState).toHaveBeenLastCalledWith(expect.objectContaining({
            visualizationState: expect.objectContaining({ shownFilters: ['tags'] }),
        }));
    });

    it('shows selections at their headings on hover/focus and clears only that filter', async () => {
        const onChange = vi.fn();
        const onDateRangeChange = vi.fn();
        const goalChart = {
            selectedCategory: 'goals', selectedVisualization: 'timeDistribution',
            visualizationState: {}, visualizationStateByKey: {},
        };
        const filters = { goals: { goalIds: ['g'] }, activities: { activityIds: ['a'] },
            tags: { tagIds: ['heavy', 'paused'], match: 'exact' }, sessions: { templateIds: ['tpl-a'], programDayIds: ['day-1'] } };
        render(
            <AnalyticsFiltersSidebar rootId="root-1" sessions={sessions} filters={filters}
                goals={[{ id: 'g', name: 'Chapter 3 – Note Hierarchy' }]}
                activities={[{ id: 'a', name: 'Guitar practice' }]}
                dateRange={{ start: '2026-10-01', end: '2026-10-31' }}
                selectedWindowState={goalChart} windowStates={{ w: goalChart }}
                onChange={onChange} onDateRangeChange={onDateRangeChange} />,
        );
        expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
        expect(screen.queryByText('Chapter 3 – Note Hierarchy')).not.toBeInTheDocument();
        const timeInfo = screen.getByRole('button', { name: 'View time range filter selections' });
        fireEvent.mouseEnter(timeInfo);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Oct 1 – Oct 31');
        fireEvent.mouseLeave(timeInfo);
        const goalInfo = screen.getByRole('button', { name: 'View goals filter selections' });
        fireEvent.focus(goalInfo);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Chapter 3 – Note Hierarchy');
        fireEvent.blur(goalInfo);
        const tagInfo = await screen.findByRole('button', { name: 'View tags filter selections' });
        fireEvent.focus(tagInfo);
        const details = await screen.findByRole('tooltip');
        expect(details).toHaveTextContent('Heavy, Paused');
        expect(details).toHaveTextContent('Exact tag set');
        expect(details).toHaveTextContent('Not applied to Time Spent Per Goal');
        fireEvent.blur(tagInfo);
        fireEvent.click(screen.getByRole('button', { name: 'Clear goals filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ goals: expect.objectContaining({ goalIds: [] }), tags: filters.tags }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear activities filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ activities: { activityIds: [], groupIds: [] }, tags: filters.tags }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear tags filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: null, sessions: filters.sessions }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear session template filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: { templateIds: [], programDayIds: ['day-1'] } }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear program day filter' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: { templateIds: ['tpl-a'], programDayIds: [] } }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear time range filter' }));
        expect(onDateRangeChange).toHaveBeenLastCalledWith({ start: null, end: null });
        expect(screen.getByText('6 active')).toBeInTheDocument();
    });
});


describe('dashboard sidebar tabs', () => {
    const chart = (id) => ({ selectedCategory: 'activities', selectedVisualization: id, visualizationState: { shownFilters: ['tags'] } });
    it('keeps global filters above tabs and edits only the selected chart', async () => {
        const update = vi.fn();
        const onChange = vi.fn();
        render(<AnalyticsFiltersSidebar rootId="root" filters={{}} dateRange={{}} onChange={onChange}
            windowStates={{ one: chart('activityTrends'), two: chart('activityFrequency') }} selectedWindowId="one" onUpdateWindowState={update} />);
        const global = screen.getByRole('region', { name: 'Global filters' });
        const tabs = within(screen.getByRole('tablist', { name: 'Chart filters' })).getAllByRole('tab');
        expect(tabs).toHaveLength(2);
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        expect(within(global).queryByRole('heading', { name: 'Time Range' })).not.toBeInTheDocument();
        expect(within(global).getByRole('button', { name: 'Show' })).toHaveAttribute('aria-expanded', 'false');
        expect(within(global).queryByRole('list', { name: 'Additional filters' })).not.toBeInTheDocument();
        fireEvent.click(within(global).getByRole('button', { name: 'Show' }));
        fireEvent.click(within(global).getByRole('button', { name: 'Time range' }));
        expect(within(global).getByRole('heading', { name: 'Time Range' })).toBeVisible();
        fireEvent.click(within(global).getByRole('button', { name: 'Hide' }));
        expect(within(global).queryByRole('heading', { name: 'Time Range' })).not.toBeInTheDocument();
        expect(within(global).queryByRole('list', { name: 'Additional filters' })).not.toBeInTheDocument();
        fireEvent.click(within(global).getByRole('button', { name: 'Show' }));
        expect(within(global).getByRole('heading', { name: 'Time Range' })).toBeVisible();
        expect(document.querySelector('details')).not.toBeInTheDocument();
        let panel = screen.getByRole('tabpanel');
        expect(within(panel).queryByRole('heading', { name: 'Time Range' })).not.toBeInTheDocument();
        expect(within(panel).queryByRole('button', { name: 'Time range' })).not.toBeInTheDocument();
        expect(within(panel).getByRole('region', { name: 'Group by' })).toBeInTheDocument();
        fireEvent.change(within(panel).getByRole('combobox', { name: 'Group by' }), { target: { value: 'activity' } });
        expect(update).toHaveBeenLastCalledWith('one', expect.objectContaining({ visualizationState: expect.objectContaining({ groupBy: { dimension: 'activity' } }) }));
        fireEvent.click(await within(panel).findByRole('button', { name: 'Heavy' }));
        expect(update).toHaveBeenLastCalledWith('one', expect.objectContaining({ localFilters: expect.objectContaining({ tags: { tagIds: ['heavy'], match: 'all' } }) }));
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(tabs[1]);
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
        panel = screen.getByRole('tabpanel');
        fireEvent.click(await within(panel).findByRole('button', { name: 'Heavy' }));
        expect(update).toHaveBeenLastCalledWith('two', expect.objectContaining({ localFilters: expect.objectContaining({ tags: { tagIds: ['heavy'], match: 'all' } }) }));
        fireEvent.keyDown(tabs[1], { key: 'Home' });
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        expect(tabs[0]).toHaveFocus();
        expect(within(global).getByRole('heading', { name: 'Time Range' })).toBeVisible();
    });

    it('names chart tabs as their panes do, including custom names', () => {
        render(<AnalyticsFiltersSidebar rootId="root" filters={{}} dateRange={{}}
            windowStates={{ empty: {}, one: { ...chart('activityTrends'), chartTitle: 'Squat trend' }, two: chart('activityFrequency') }}
            selectedWindowId="one" onUpdateWindowState={vi.fn()} />);
        const tabs = within(screen.getByRole('tablist', { name: 'Chart filters' })).getAllByRole('tab');
        expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Squat trend, chart 1', expect.stringMatching(/, chart 2$/)]);
    });

    it('renames the selected chart from its sidebar tab panel', () => {
        const update = vi.fn();
        render(<AnalyticsFiltersSidebar rootId="root" filters={{}} dateRange={{}}
            windowStates={{ one: chart('activityTrends'), two: { ...chart('activityFrequency'), chartTitle: 'Reps' } }}
            selectedWindowId="two" onUpdateWindowState={update} />);
        const panel = screen.getByRole('tabpanel');
        fireEvent.click(within(panel).getByRole('button', { name: 'Rename Reps' }));
        fireEvent.change(within(panel).getByRole('textbox', { name: 'Chart name' }), { target: { value: 'Weekly reps' } });
        fireEvent.keyDown(within(panel).getByRole('textbox', { name: 'Chart name' }), { key: 'Enter' });
        expect(update).toHaveBeenLastCalledWith('two', { chartTitle: 'Weekly reps' });
    });
});

