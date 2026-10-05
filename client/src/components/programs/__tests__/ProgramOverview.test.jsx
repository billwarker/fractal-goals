import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import ProgramOverview from '../ProgramOverview';

const metrics = {
    program: { progress: { rate: 0.32 } },
    window: { display_start: '2026-08-20', display_end: '2026-10-31', as_of: '2026-09-04', is_partial: false, observed_days: 16, total_days: 73 },
    consistency: { mode: 'scheduled', rate: 0.75, current_streak: 4 },
    outcomes: { goals_completed_in_window: 2, goals_in_scope: 5 },
    goal_coverage: [
        { goal_id: 'goal-1', name: 'Ship the insight', type: 'ShortTermGoal', effort_share: 0.42 },
        { goal_id: 'goal-2', name: 'Build consistency', type: 'ImmediateGoal', effort_share: 0 },
    ],
    blocks: [
        { block_id: 'current', name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30', color: '#ef4444', consistency: { met_days: 2, scheduled_days_observed: 3 }, program_days: [{ program_day_id: 'practice', name: 'Daily practice', completed_occurrences: 2, scheduled_occurrences: 3 }, { program_day_id: 'review', name: 'Weekly review', completed_occurrences: 1, scheduled_occurrences: 1 }], linked_sessions: 6 },
        { block_id: 'past', name: 'Preparation', start_date: '2026-08-20', end_date: '2026-08-31', consistency: { met_days: 4, scheduled_days_observed: 5 }, linked_sessions: 4 },
        { block_id: 'future', name: 'Month 2', start_date: '2026-10-01', end_date: '2026-10-31', consistency: { met_days: 0, scheduled_days_observed: 0 }, linked_sessions: 0 },
    ],
};

describe('ProgramOverview', () => {
    it('shows the requested full-program summary without the daily consistency chart', () => {
        render(<ProgramOverview metrics={metrics} />);

        const stats = screen.getByLabelText('Program metrics');
        expect(within(stats).getByText('Consistency')).toBeInTheDocument();
        expect(within(stats).getByText('75%')).toBeInTheDocument();
        expect(within(stats).getByText('Goals completed')).toBeInTheDocument();
        expect(within(stats).getByText('2 / 5')).toBeInTheDocument();
        expect(within(stats).queryByText('Alignment')).not.toBeInTheDocument();
        expect(within(stats).getByText('4 days')).toBeInTheDocument();
        expect(within(stats).getByText('32%')).toBeInTheDocument();
        expect(within(stats).queryByText('Adherence')).not.toBeInTheDocument();
    });

    it('lists events ahead of blocks and leaves the goal hierarchy to the Goals view', () => {
        const period = { id: 'p1', name: 'Vacation', start_date: '2026-09-10', end_date: '2026-09-12', protects_streaks: true };
        render(<ProgramOverview metrics={{ ...metrics, periods: [period] }} blocks={<ul aria-label="Blocks" />} />);

        expect(screen.queryByRole('heading', { name: 'Goal coverage' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
        const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
        expect(headings).toEqual(['Events', 'Blocks']);
    });

    it('uses the selected timeframe for progress', () => {
        const scopedMetrics = {
            ...metrics,
            window: { display_start: '2026-09-01', display_end: '2026-09-03', as_of: '2026-09-04', is_partial: true, observed_days: 3, total_days: 3 },
        };
        render(<ProgramOverview metrics={scopedMetrics} />);

        expect(screen.getByLabelText('Program metrics')).toHaveTextContent('Program progress100%');
    });

    it('explains days protected by events and lists overlapping events', () => {
        render(<ProgramOverview metrics={{
            ...metrics,
            consistency: { ...metrics.consistency, period_rest_days: 3 },
            periods: [
                { id: 'p1', name: 'Lisbon', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-17', protects_streaks: true },
                { id: 'p2', name: 'Conference', kind: 'travel', start_date: '2026-09-20', end_date: '2026-09-21', protects_streaks: false },
            ],
        }} />);

        const section = screen.getByRole('heading', { name: 'Events' }).closest('section');
        expect(within(section).getByText(/3 days protected by events/)).toBeInTheDocument();
        expect(within(section).getByText('Lisbon')).toBeInTheDocument();
        expect(within(section).getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'Sep 10 – Sep 17')).toBeInTheDocument();
        expect(within(section).getByText('Not protecting streaks')).toBeInTheDocument();
    });

    it('opens the event editor when an event is clicked', () => {
        const onEditPeriod = vi.fn();
        const period = { id: 'p1', name: 'Lisbon', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-17', protects_streaks: true };
        render(<ProgramOverview metrics={{ ...metrics, periods: [period] }} onEditPeriod={onEditPeriod} />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit event Lisbon' }));

        expect(onEditPeriod).toHaveBeenCalledWith(period);
    });

    it('omits the events section when nothing overlaps', () => {
        render(<ProgramOverview metrics={metrics} />);

        expect(screen.queryByRole('heading', { name: 'Events' })).not.toBeInTheDocument();
    });
});
