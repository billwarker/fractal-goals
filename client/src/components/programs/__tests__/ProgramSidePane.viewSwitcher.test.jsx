import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProgramSidePane from '../ProgramSidePane';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3b82f6',
        getGoalSecondaryColor: () => '#172554',
        getGoalIcon: () => 'circle',
    }),
}));

const viewToggle = <div role="tablist" aria-label="Program view"><button type="button" role="tab">Calendar</button></div>;

function renderPane(props) {
    return render(
        <MemoryRouter>
            <ProgramSidePane
                program={{ id: 'program-1', name: 'Strong Finish' }}
                goals={[]}
                blocks={[]}
                programMetricsLoading
                {...props}
            />
        </MemoryRouter>,
    );
}

describe('ProgramSidePane view switcher', () => {
    it('leads with the page view toggle and has no Details/Goals sub-toggle', () => {
        renderPane({ scope: 'program', viewToggle });

        const tablists = screen.getAllByRole('tablist');
        expect(tablists.map((list) => list.getAttribute('aria-label'))).toEqual(['Program view']);
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('shows the goal hierarchy under the program overview when no date is scoped', () => {
        renderPane({
            scope: 'program',
            viewToggle,
            programMetricsLoading: false,
            programMetrics: {
                program: { progress: { rate: 0.5 } },
                window: { is_partial: false },
                adherence: { mode: 'scheduled', rate: 0.5, current_streak: 1 },
                alignment: { duration_seconds: { rate: 0.5 } },
            },
        });

        expect(screen.getByLabelText('Program metrics')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
        expect(screen.getByText('No goals associated')).toBeInTheDocument();
    });

    it('shows whole-program block results on the Blocks view, ignoring the calendar scope', () => {
        renderPane({
            mode: 'blocks',
            scope: 'day',
            viewToggle,
            contextDate: '2026-09-02',
            blockMetrics: { blocks: [{
                block_id: 'b1', name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30',
                adherence: { met_days: 1, scheduled_days_observed: 2 }, alignment: { duration_seconds: { rate: 0.5 } },
                linked_sessions: 1, program_days: [],
            }] },
        });

        expect(screen.getByRole('heading', { name: 'Blocks' })).toBeInTheDocument();
        expect(screen.getByRole('listitem', { name: 'Month 1' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Wednesday, September 2, 2026' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Program metrics')).not.toBeInTheDocument();
    });

    it('keeps the day review heading under the toggle without a collapse control on desktop', () => {
        renderPane({
            scope: 'day',
            viewToggle,
            contextDate: '2026-09-02',
            dayDetailQuery: { data: { detail: { occurrences: [], sessions: [] } } },
        });

        expect(screen.getByRole('tablist', { name: 'Program view' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Wednesday, September 2, 2026' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('shows the days navigator under the toggle on the Days tab', () => {
        renderPane({ scope: 'program', viewToggle, daysNavigator: <nav aria-label="Program days" /> });

        expect(screen.getByRole('tablist', { name: 'Program view' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Program days' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Program days' })).not.toBeInTheDocument();
    });

    it('keeps its own headers and a Collapse control in the mobile sheet', () => {
        renderPane({ scope: 'program', onCollapse: vi.fn() });

        expect(screen.getByRole('heading', { name: 'Strong Finish' })).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    });
});
