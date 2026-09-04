import React from 'react';
import { render, screen, within } from '@testing-library/react';

import ProgramOverview from '../ProgramOverview';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#8b6fff',
        getGoalSecondaryColor: () => '#181329',
        getGoalIcon: () => 'triangle',
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape }) => <svg data-testid="overview-goal-icon" data-shape={shape} />,
}));

const metrics = {
    program: { progress: { rate: 0.32 } },
    window: { display_start: '2026-08-20', display_end: '2026-10-31', as_of: '2026-09-04', is_partial: false, observed_days: 16, total_days: 73 },
    adherence: { mode: 'scheduled', rate: 0.75, current_streak: 4 },
    alignment: { duration_seconds: { rate: 0.6 } },
    goal_coverage: [
        { goal_id: 'goal-1', name: 'Ship the insight', type: 'ShortTermGoal', effort_share: 0.42 },
        { goal_id: 'goal-2', name: 'Build consistency', type: 'ImmediateGoal', effort_share: 0 },
    ],
    blocks: [
        { block_id: 'current', name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30', color: '#ef4444', adherence: { met_days: 2, scheduled_days_observed: 3 }, program_days: [{ program_day_id: 'practice', name: 'Daily practice', completed_occurrences: 2, scheduled_occurrences: 3 }, { program_day_id: 'review', name: 'Weekly review', completed_occurrences: 1, scheduled_occurrences: 1 }], alignment: { duration_seconds: { rate: 0.8 } }, linked_sessions: 6 },
        { block_id: 'past', name: 'Preparation', start_date: '2026-08-20', end_date: '2026-08-31', adherence: { met_days: 4, scheduled_days_observed: 5 }, alignment: { duration_seconds: { rate: 0.7 } }, linked_sessions: 4 },
        { block_id: 'future', name: 'Month 2', start_date: '2026-10-01', end_date: '2026-10-31', adherence: { met_days: 0, scheduled_days_observed: 0 }, alignment: { duration_seconds: { rate: null } }, linked_sessions: 0 },
    ],
};

describe('ProgramOverview', () => {
    it('shows the requested full-program summary without the daily adherence chart', () => {
        render(<ProgramOverview metrics={metrics} />);

        const stats = screen.getByLabelText('Program metrics');
        expect(within(stats).getByText('75%')).toBeInTheDocument();
        expect(within(stats).getByText('60%')).toBeInTheDocument();
        expect(within(stats).getByText('4 days')).toBeInTheDocument();
        expect(within(stats).getByText('32%')).toBeInTheDocument();
        expect(screen.queryByText('Adherence by day')).not.toBeInTheDocument();
    });

    it('renders compact effort shares and only blocks that have started', () => {
        render(<ProgramOverview metrics={metrics} />);

        const goalSection = screen.getByRole('heading', { name: 'Goal coverage' }).closest('section');
        expect(within(goalSection).getByText('Ship the insight')).toBeInTheDocument();
        expect(within(goalSection).getByText('42%')).toBeInTheDocument();
        expect(within(goalSection).queryByText('Build consistency')).not.toBeInTheDocument();
        expect(within(goalSection).getAllByTestId('overview-goal-icon')).toHaveLength(1);
        expect(within(goalSection).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
            'Ship the insight42%',
        ]);

        const blockSection = screen.getByRole('heading', { name: 'Blocks in scope' }).closest('section');
        expect(within(blockSection).getByText('Preparation')).toBeInTheDocument();
        const currentBlock = within(blockSection).getByText('Month 1').closest('li');
        expect(within(blockSection).queryByText('Month 2')).not.toBeInTheDocument();
        expect(within(currentBlock).getAllByText('2 / 3')).toHaveLength(2);
        expect(within(currentBlock).getByText('80%')).toBeInTheDocument();
        expect(within(currentBlock).getByText('6')).toBeInTheDocument();
        expect(within(currentBlock).getByText('Daily practice').closest('li')).toHaveTextContent('Daily practice2 / 3');
        expect(within(currentBlock).getByText('Weekly review').closest('li')).toHaveTextContent('Weekly review1 / 1');
        expect(blockSection.compareDocumentPosition(goalSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('uses the selected timeframe for progress and block visibility', () => {
        const scopedMetrics = {
            ...metrics,
            window: { display_start: '2026-09-01', display_end: '2026-09-03', as_of: '2026-09-04', is_partial: true, observed_days: 3, total_days: 3 },
        };
        render(<ProgramOverview metrics={scopedMetrics} />);

        expect(screen.getByLabelText('Program metrics')).toHaveTextContent('Program progress100%');
        expect(screen.queryByText('Preparation')).not.toBeInTheDocument();
        expect(screen.getByText('Month 1')).toBeInTheDocument();
    });
});
