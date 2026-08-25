import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ProgramInsights from '../ProgramInsights';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: (goal) => goal === 'ShortTermGoal' ? '#8b6fff' : '#f59f4d',
        getGoalSecondaryColor: (goal) => goal === 'ShortTermGoal' ? '#181329' : '#2c1d0f',
        getGoalIcon: (goal) => goal === 'ShortTermGoal' ? 'triangle' : 'diamond',
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape, color, secondaryColor, isSmart }) => (
        <svg
            data-testid="goal-coverage-icon"
            data-shape={shape}
            data-color={color}
            data-secondary-color={secondaryColor}
            data-smart={String(isSmart)}
        />
    ),
}));

const metrics = {
    calculation_version: 1,
    program: { progress: { rate: 0.5 }, status: 'ended' },
    window: { scope_label: '2026-01-01 – 2026-01-02', as_of: '2026-01-01', previous_range: null, next_range: { start: '2026-01-03', end: '2026-01-04' } },
    adherence: { mode: 'scheduled', rate: 0.5, current_streak: 1 },
    alignment: { duration_seconds: { rate: 0.75 } },
    data_sufficiency: { message: 'Needs 7 observed days — 1 so far' },
    days: [{ date: '2026-01-01', state: 'scheduled_met', instances: 2, duration_seconds: 3600 }],
    blocks: [
        { block_id: 'block-3', name: 'Block 3', start_date: '2026-01-15', end_date: '2026-01-21', adherence: { met_days: 1, scheduled_days_observed: 3 }, alignment: { duration_seconds: { rate: 0.25 } }, linked_sessions: 2 },
        { block_id: 'block-1', name: 'Block 1', start_date: '2026-01-01', end_date: '2026-01-07', adherence: { met_days: 4, scheduled_days_observed: 4 }, alignment: { duration_seconds: { rate: 1 } }, linked_sessions: 5 },
        { block_id: 'block-2', name: 'Block 2', start_date: '2026-01-08', end_date: '2026-01-14', adherence: { met_days: 2, scheduled_days_observed: 4 }, alignment: { duration_seconds: { rate: 0.5 } }, linked_sessions: 3 },
    ],
    goal_coverage: [
        {
            goal_id: 'goal-1',
            name: 'Ship the insight',
            level_id: 'mid-level',
            level_name: 'Mid Term Goal',
            type: 'MidTermGoal',
            is_smart: true,
            effort_share: 0.5,
            credited_instances: 2,
            last_evidence_at: '2026-01-01T12:00:00Z',
        },
        {
            goal_id: 'goal-2',
            name: 'Legacy goal',
            level_id: null,
            level_name: null,
            type: 'ShortTermGoal',
            is_smart: false,
            effort_share: 0,
            credited_instances: 0,
            last_evidence_at: null,
        },
    ],
    templates: [], volume: [],
    weekday: Array.from({ length: 7 }, (_, weekday) => ({ weekday, met_days: 0, scheduled_days_observed: 0, instances: 0, duration_seconds: 0 })),
    outcomes: { goals_completed_in_window: 0, goals_in_scope: 1, targets_met_in_window: [], targets_open: 0 },
};

describe('ProgramInsights', () => {
    it('renders non-color daily semantics, tables, and range navigation', () => {
        const onRangeChange = vi.fn();
        render(<ProgramInsights metrics={metrics} onRangeChange={onRangeChange} onLoadComparison={() => {}} />);
        expect(screen.getByLabelText('2026-01-01: scheduled met')).toBeInTheDocument();
        expect(screen.getByText('Daily data table')).toBeInTheDocument();
        const legend = screen.getByRole('list', { name: 'Adherence cell legend' });
        expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Met', 'Missed', 'Unscheduled evidence', 'Rest', 'Upcoming']);
        expect(screen.getByText('75%')).toBeInTheDocument();
        const goalCell = screen.getByRole('cell', { name: 'Ship the insight' });
        const goalIcon = goalCell.querySelector('[data-testid="goal-coverage-icon"]');
        expect(goalIcon.parentElement).toBe(goalCell.firstElementChild.firstElementChild);
        expect(goalIcon.parentElement.nextElementSibling).toHaveTextContent('Ship the insight');
        expect(goalIcon).toHaveAttribute('data-shape', 'diamond');
        expect(goalIcon).toHaveAttribute('data-color', '#f59f4d');
        expect(goalIcon).toHaveAttribute('data-secondary-color', '#2c1d0f');
        expect(goalIcon).toHaveAttribute('data-smart', 'true');
        const legacyIcon = screen.getByRole('cell', { name: 'Legacy goal' }).querySelector('[data-testid="goal-coverage-icon"]');
        expect(legacyIcon).toHaveAttribute('data-shape', 'triangle');
        expect(legacyIcon).toHaveAttribute('data-color', '#8b6fff');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(onRangeChange).toHaveBeenCalledWith(metrics.window.next_range);
    });

    it('orders blocks chronologically by default and sorts both requested tables by their fields', () => {
        render(<ProgramInsights metrics={metrics} onRangeChange={() => {}} onLoadComparison={() => {}} />);

        const blocksTable = screen.getByRole('heading', { name: 'Blocks' }).closest('section').querySelector('table');
        expect(within(blocksTable).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Block 1', 'Block 2', 'Block 3']);
        expect(within(blocksTable).getByRole('columnheader', { name: /Block/ })).toHaveAttribute('aria-sort', 'ascending');

        fireEvent.click(within(blocksTable).getByRole('button', { name: /Linked sessions/ }));
        expect(within(blocksTable).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Block 3', 'Block 2', 'Block 1']);
        fireEvent.click(within(blocksTable).getByRole('button', { name: /Linked sessions/ }));
        expect(within(blocksTable).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Block 1', 'Block 2', 'Block 3']);

        const goalsTable = screen.getByRole('heading', { name: 'Goal coverage' }).closest('section').querySelector('table');
        fireEvent.click(within(goalsTable).getByRole('button', { name: /^Effort share/ }));
        expect(within(goalsTable).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Legacy goal', 'Ship the insight']);
        expect(within(goalsTable).getByRole('columnheader', { name: /Effort share/ })).toHaveAttribute('aria-sort', 'ascending');
    });

    it('explains effort share in a keyboard-linked tooltip and colors comparison program names', () => {
        const comparison = { programs: [{ program_id: 'past-1', name: 'Previous plan', color: '#22c55e', adherence_rate: 0.8, alignment_rate: 0.75, met_days: 12 }] };
        render(<ProgramInsights metrics={metrics} comparison={comparison} onRangeChange={() => {}} onLoadComparison={() => {}} />);

        const helpButton = screen.getByRole('button', { name: 'How effort share is calculated' });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        fireEvent.focus(helpButton);
        const tooltip = screen.getByRole('tooltip');
        expect(helpButton).toHaveAttribute('aria-describedby', tooltip.id);
        expect(tooltip).toHaveTextContent('duration is split equally across its eligible goals');
        expect(tooltip.parentElement).toBe(document.body);
        expect(tooltip).toHaveStyle({ position: 'fixed' });
        expect(screen.getByText('Previous plan')).toHaveStyle({ color: '#22c55e' });
    });
});
