import React from 'react';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GoalActivityHeatmap from '../GoalActivityHeatmap';

const { mockQuery, mockPages } = vi.hoisted(() => ({ mockQuery: vi.fn(), mockPages: vi.fn() }));
vi.mock('../../../hooks/useGoalActivityHeatmap', () => ({ useGoalActivityHeatmap: mockQuery }));
vi.mock('../../../hooks/useGoalTimelinePages', () => ({ useGoalTimelinePages: mockPages }));
vi.mock('../../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));
vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => ({
    ...await importOriginal(),
    useGoalLevels: () => ({ goalLevels: [{ id: 'long-term', name: 'Long Term Goal', color: '#ff9800' }], getGoalColor: () => '#ff9800' }),
}));
vi.mock('../GoalTimelineEntries', () => ({
    GoalTimelineEntries: ({ entries }) => <div>{entries.map((entry) => <p key={entry.id}>{entry.title}</p>)}</div>,
}));

const data = {
    range_start: '2026-07-01', range_end: '2026-07-03',
    total_activities: 3, total_events: 5, work_days: 2, event_days: 3, total_duration_seconds: 900,
    days: [
        { date: '2026-07-01', activities: 0, events: 1, milestones: 0, duration_seconds: 0 },
        { date: '2026-07-02', activities: 2, events: 3, milestones: 1, duration_seconds: 900 },
        { date: '2026-07-03', activities: 1, events: 1, milestones: 0, duration_seconds: 0 },
    ],
};
const props = { rootId: 'root', goalId: 'goal', goal: { id: 'goal' } };
const cell = (date) => screen.getByRole('button', { name: new RegExp(`^${date} ·`) });

describe('GoalActivityHeatmap', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockPages.mockReset();
        mockPages.mockImplementation((rootId, goalId, options) => ({ data: { pages: [{ entries: options.date ? [{ id: 'a', title: 'Completed guitar practice' }] : [], pagination: { total: options.date ? 1 : 0 } }] } }));
        mockQuery.mockImplementation((rootId, goalId, options) => options.date ? {
            data: { entries: [{ id: 'a', title: 'Completed guitar practice' }] },
        } : { data });
    });

    it('uses activity counts only and puts a compact legend below the chart followed by work totals', () => {
        render(<GoalActivityHeatmap {...props} />);
        expect(screen.getByText(/2 days with recorded work · 3 completed activities/)).toBeInTheDocument();
        expect(cell('2026-07-01')).toHaveAttribute('data-level', '0');
        expect(cell('2026-07-01').children).toHaveLength(1);
        expect(cell('2026-07-02')).toHaveAttribute('data-level', '2');
        expect(cell('2026-07-03')).toHaveAttribute('data-level', '1');
        expect(screen.queryByText(/recorded minutes/)).not.toBeInTheDocument();
        expect(screen.queryByText('Focus or hover a day for details.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^(Activities|All events|Work time)$/ })).not.toBeInTheDocument();
        const legend = screen.getByRole('group', { name: 'Completed activities per day' });
        const calendar = screen.getByRole('region', { name: 'Activity calendar' });
        const summary = screen.getByText(/2 days with recorded work/);
        expect(calendar.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(legend.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole('img', { name: 'Dot: other timeline events' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Diamond: target or goal achievement' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Outline: goal paused on this day' })).toBeInTheDocument();
    });

    it('shows hovered and focused days, retains selection, and otherwise restores lifetime totals', () => {
        render(<GoalActivityHeatmap {...props} />);
        const summary = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
        expect(screen.queryByText(/2026-07-01 → 2026-07-03/)).not.toBeInTheDocument();
        expect(summary).toHaveTextContent('2 days with recorded work');
        const touchHover = createEvent.pointerOver(cell('2026-07-02'));
        Object.defineProperty(touchHover, 'pointerType', { value: 'touch' });
        fireEvent(cell('2026-07-02'), touchHover);
        expect(summary).toHaveTextContent('2 days with recorded work');
        fireEvent.pointerEnter(cell('2026-07-02'));
        expect(summary).toHaveTextContent('2026-07-02 · 2 completed activities · 3 events · 1 milestone');
        fireEvent.pointerLeave(cell('2026-07-02'));
        expect(summary).toHaveTextContent('2 days with recorded work');
        fireEvent.focus(cell('2026-07-03'));
        expect(summary).toHaveTextContent('2026-07-03 · 1 completed activity · 1 event');
        fireEvent.blur(cell('2026-07-03'));
        fireEvent.click(cell('2026-07-02'));
        expect(summary).toHaveTextContent('2026-07-02 · 2 completed activities');
        fireEvent.pointerEnter(cell('2026-07-01'));
        expect(summary).toHaveTextContent('2026-07-01 · 0 completed activities · 1 event');
        fireEvent.pointerLeave(cell('2026-07-01'));
        expect(summary).toHaveTextContent('2026-07-02 · 2 completed activities');
        fireEvent.click(screen.getByLabelText('Include children'));
        expect(summary).toHaveTextContent('2 days with recorded work');
    });

    it('uses the original goal level colour for cells and legend even after completion', () => {
        render(<GoalActivityHeatmap {...props} goal={{ attributes: { level: { color: '#916aff' }, completed: true } }} />);
        expect(screen.getByRole('region', { name: 'Timeline', exact: true }).style.getPropertyValue('--heatmap-accent')).toBe('#916aff');
        expect(screen.getByRole('region', { name: 'Activity calendar' }).style.getPropertyValue('--heatmap-accent')).toBe('#916aff');
    });

    it('opens local-day evidence and restores cell focus on close', async () => {
        render(<GoalActivityHeatmap {...props} />);
        fireEvent.click(cell('2026-07-02'));
        expect(await screen.findByText('Completed guitar practice')).toBeInTheDocument();
        expect(mockPages).toHaveBeenCalledWith('root', 'goal', expect.objectContaining({ date: '2026-07-02', metric: 'events', includeChildren: true, timezone: 'UTC' }));
        expect(screen.getByRole('heading', { name: '2026-07-02' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
        expect(cell('2026-07-02')).toHaveFocus();
        expect(screen.queryByText('Completed guitar practice')).not.toBeInTheDocument();
    });

    it('changes descendant scope and clears the selected day', async () => {
        render(<GoalActivityHeatmap {...props} />);
        fireEvent.click(cell('2026-07-02'));
        await screen.findByText('Completed guitar practice');
        fireEvent.click(screen.getByLabelText('Include children'));
        expect(screen.queryByText('Completed guitar practice')).not.toBeInTheDocument();
        await waitFor(() => expect(mockQuery).toHaveBeenLastCalledWith('root', 'goal', { includeChildren: false, timezone: 'UTC', enabled: true }));
    });

    it('preserves an empty calendar and offers retry after a failed read', () => {
        mockQuery.mockReturnValueOnce({ data: { ...data, total_activities: 0 } });
        const view = render(<GoalActivityHeatmap {...props} />);
        expect(screen.getByText(/No work recorded yet/)).toBeInTheDocument();
        expect(cell('2026-07-01')).toBeInTheDocument();
        const refetch = vi.fn();
        mockQuery.mockReturnValue({ isError: true, refetch });
        view.rerender(<GoalActivityHeatmap {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Retry calendar' }));
        expect(refetch).toHaveBeenCalledOnce();
    });
    it('keeps timeline evidence inspectable and records scroll and keyboard exploration', () => {
        const onExplore = vi.fn();
        render(<GoalActivityHeatmap {...props} onExplore={onExplore} />);
        expect(mockPages).toHaveBeenLastCalledWith('root', 'goal', expect.objectContaining({ metric: 'events', includeChildren: true }));
        fireEvent.click(screen.getByLabelText('Include children'));
        expect(mockPages).toHaveBeenLastCalledWith('root', 'goal', expect.objectContaining({ metric: 'events', includeChildren: false }));
        expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
        fireEvent.wheel(screen.getByRole('region', { name: 'Timeline entries' }), { deltaY: 120 });
        expect(onExplore).toHaveBeenCalledOnce();
        fireEvent.touchMove(screen.getByRole('region', { name: 'Timeline entries' }));
        expect(onExplore).toHaveBeenCalledTimes(2);
    });

    it('keeps the feed usable when the calendar read fails', () => {
        mockQuery.mockReturnValue({ isError: true, refetch: vi.fn() });
        mockPages.mockReturnValue({ data: { pages: [{ entries: [{ id: 'a', title: 'Recorded work' }], pagination: { total: 30 } }] }, hasNextPage: true, fetchNextPage: vi.fn() });
        render(<GoalActivityHeatmap {...props} />);
        expect(screen.getByText('Recorded work')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        expect(mockPages.mock.results.at(-1).value.fetchNextPage).toHaveBeenCalledOnce();
    });

    it('retains the calendar without adding another modal close control', () => {
        render(<GoalActivityHeatmap {...props} onExplore={vi.fn()} />);
        expect(screen.getByRole('region', { name: 'Activity calendar' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

});
