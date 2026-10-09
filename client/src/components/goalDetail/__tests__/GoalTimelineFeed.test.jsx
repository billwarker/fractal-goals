import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GoalTimelineFeed from '../GoalTimelineFeed';

const { pages } = vi.hoisted(() => ({ pages: vi.fn(() => ({ isLoading: false })) }));
vi.mock('../../../hooks/useGoalTimelinePages', () => ({ useGoalTimelinePages: pages }));
vi.mock('../GoalTimelineEntries', () => ({ GoalTimelineEntries: ({ entries }) => entries.map((entry) => <p key={entry.id}>{entry.title}</p>) }));

const snapshotEntries = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), title: `Work ${index}`, timestamp: '2026-10-09T02:00:00Z', event_type: 'activity.completed',
    relationship: index < 12 ? 'self' : 'descendant', payload: { duration_seconds: index < 2 ? 60 : null },
}));
const props = { rootId: 'root', goalId: 'goal', timezone: 'America/Toronto', metric: 'activities', includeChildren: true, snapshotEntries };

it('paginates published snapshots locally and never enables an authenticated read', () => {
    render(<GoalTimelineFeed {...props} />);
    expect(screen.getByText('Showing 20 of 25 entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getByText('Showing 25 of 25 entries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(pages).toHaveBeenLastCalledWith('root', 'goal', expect.objectContaining({ enabled: false }));
});

it('applies work-time, child scope and local-day filters to snapshots', () => {
    const view = render(<GoalTimelineFeed {...props} metric="duration" />);
    expect(screen.getByText('Showing 2 of 2 entries')).toBeInTheDocument();
    view.rerender(<GoalTimelineFeed {...props} includeChildren={false} date="2026-10-08" />);
    expect(screen.getByText('Showing 12 of 12 entries')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2026-10-08' })).toHaveFocus();
    view.rerender(<GoalTimelineFeed {...props} date="2026-10-09" />);
    expect(screen.getByText('Showing 0 of 0 entries')).toBeInTheDocument();
});
