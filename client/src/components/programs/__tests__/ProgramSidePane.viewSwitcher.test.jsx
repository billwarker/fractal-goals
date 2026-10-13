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
    it('shows only Details/Goals at program scope and no tabs at range scope', () => {
        const onViewChange = vi.fn();
        const { unmount } = renderPane({ scope: 'program', onViewChange });

        const tablists = screen.getAllByRole('tablist');
        expect(tablists.map((list) => list.getAttribute('aria-label'))).toEqual(['Program side pane views']);
        screen.getByRole('tab', { name: 'Goals' }).click();
        expect(onViewChange).toHaveBeenCalledWith('goals');
        unmount();

        renderPane({ scope: 'range', selectedRange: { startDate: '2026-09-01', endDate: '2026-09-03' } });
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('shows the goal hierarchy in the Goals view instead of the overview', () => {
        renderPane({
            scope: 'program',
            view: 'goals',
            programMetricsLoading: false,
            programMetrics: {
                program: { progress: { rate: 0.5 } },
                window: { is_partial: false },
                consistency: { mode: 'scheduled', rate: 0.5, current_streak: 1 },
                outcomes: { goals_completed_in_window: 0, goals_in_scope: 0 },
            },
        });

        expect(screen.queryByLabelText('Program metrics')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Goals' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('No goals associated')).toBeInTheDocument();
    });

    it('places the blocks section after the headline metrics at program scope only', () => {
        const metrics = {
            program: { progress: { rate: 0.5 } },
            window: { is_partial: false },
            consistency: { mode: 'scheduled', rate: 0.5, current_streak: 1 },
            outcomes: { goals_completed_in_window: 0, goals_in_scope: 0 },
        };
        const blocksPanel = <ul aria-label="Blocks"><li>Month 1</li></ul>;
        const { unmount } = renderPane({ scope: 'program', programMetricsLoading: false, programMetrics: metrics, blocksPanel });

        const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
        expect(headings).toEqual(['Blocks']);
        expect(screen.queryByText('No goals associated')).not.toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Blocks' })).toBeInTheDocument();
        unmount();

        renderPane({
            scope: 'range', programMetricsLoading: false, programMetrics: { ...metrics, window: { is_partial: true } },
            blocksPanel, selectedRange: { startDate: '2026-09-01', endDate: '2026-09-03' },
        });
        expect(screen.queryByRole('list', { name: 'Blocks' })).not.toBeInTheDocument();
    });

    it('offers New block and New event in the Details footer only', () => {
        const onCreateBlock = vi.fn();
        const onCreateEvent = vi.fn();
        const { unmount } = renderPane({ scope: 'program', onCreateBlock, onCreateEvent });

        screen.getByRole('button', { name: 'New block' }).click();
        screen.getByRole('button', { name: 'New event' }).click();
        expect(onCreateBlock).toHaveBeenCalledTimes(1);
        expect(onCreateEvent).toHaveBeenCalledTimes(1);
        unmount();

        renderPane({ scope: 'program', view: 'goals', onCreateBlock, onCreateEvent });
        expect(screen.queryByRole('button', { name: 'New block' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New event' })).not.toBeInTheDocument();
    });

    it('keeps the day review heading without page view tabs', () => {
        renderPane({
            scope: 'day',
            contextDate: '2026-09-02',
            dayDetailQuery: { data: { detail: { occurrences: [], sessions: [] } } },
        });

        expect(screen.queryByRole('tablist', { name: 'Program view' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Wednesday, September 2, 2026' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('shows the days navigator beneath its header on the Days tab', () => {
        renderPane({ scope: 'program', daysNavigator: <nav aria-label="Program days" /> });

        expect(screen.queryByRole('tablist', { name: 'Program view' })).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Program days' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Program days' })).toBeInTheDocument();
    });

    it('puts Details/Goals beside one Collapse control at program scope and retains Collapse at day scope', () => {
        const onCollapse = vi.fn();
        const { unmount } = renderPane({ scope: 'program', onCollapse });

        const collapse = screen.getByRole('button', { name: 'Collapse' });
        expect(collapse.closest('div').parentElement).toContainElement(screen.getByRole('tablist', { name: 'Program side pane views' }));
        collapse.click();
        expect(onCollapse).toHaveBeenCalledTimes(1);
        unmount();

        renderPane({
            scope: 'day', onCollapse, contextDate: '2026-09-02',
            dayDetailQuery: { data: { detail: { occurrences: [], sessions: [] } } },
        });
        expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    });

    it('keeps its headers and a Collapse control in the mobile sheet', () => {
        renderPane({ scope: 'program', onCollapse: vi.fn() });

        expect(screen.getAllByRole('tablist').map((list) => list.getAttribute('aria-label'))).toEqual(['Program side pane views']);
        expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    });

    it('splits the Days pane into Details (the day selector) and Goals (the active plan hierarchy)', () => {
        const onViewChange = vi.fn();
        const navigator = <nav aria-label="Program days">Days list</nav>;
        const goals = <div>Plan goals</div>;
        const { rerender } = renderPane({ scope: 'program', daysNavigator: navigator, daysGoals: goals, onViewChange, onCollapse: vi.fn() });

        const collapse = screen.getByRole('button', { name: 'Collapse' });
        expect(collapse.closest('div').parentElement).toContainElement(screen.getByRole('tablist', { name: 'Program side pane views' }));
        expect(screen.getByRole('navigation', { name: 'Program days' })).toBeInTheDocument();
        expect(screen.queryByText('Plan goals')).not.toBeInTheDocument();
        screen.getByRole('tab', { name: 'Goals' }).click();
        expect(onViewChange).toHaveBeenCalledWith('goals');

        rerender(
            <MemoryRouter>
                <ProgramSidePane
                    program={{ id: 'program-1', name: 'Strong Finish' }} goals={[]} blocks={[]} programMetricsLoading
                    scope="program" view="goals" daysNavigator={navigator} daysGoals={goals}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText('Plan goals')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Program days' })).not.toBeInTheDocument();
    });
});
