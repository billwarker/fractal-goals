import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    program: { progress: { rate: 0.5 } },
    window: { scope_label: '2026-01-01 – 2026-01-02', as_of: '2026-01-01', previous_range: null, next_range: { start: '2026-01-03', end: '2026-01-04' } },
    adherence: { mode: 'scheduled', rate: 0.5, current_streak: 1 },
    alignment: { duration_seconds: { rate: 0.75 } },
    data_sufficiency: { message: 'Needs 7 observed days — 1 so far' },
    days: [{ date: '2026-01-01', state: 'scheduled_met', instances: 2, duration_seconds: 3600 }],
    blocks: [],
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
});
