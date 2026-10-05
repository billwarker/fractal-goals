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
    it('leads with the page view toggle, with the Details/Goals sub-toggle beneath at program scope', () => {
        const onViewChange = vi.fn();
        const { unmount } = renderPane({ scope: 'program', viewToggle, onViewChange });

        const tablists = screen.getAllByRole('tablist');
        expect(tablists.map((list) => list.getAttribute('aria-label'))).toEqual(['Program view', 'Program side pane views']);
        screen.getByRole('tab', { name: 'Goals' }).click();
        expect(onViewChange).toHaveBeenCalledWith('goals');
        unmount();

        renderPane({ scope: 'range', viewToggle, selectedRange: { startDate: '2026-09-01', endDate: '2026-09-03' } });
        expect(screen.getAllByRole('tablist').map((list) => list.getAttribute('aria-label'))).toEqual(['Program view']);
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('shows the goal hierarchy in the Goals view instead of the overview', () => {
        renderPane({
            scope: 'program',
            view: 'goals',
            viewToggle,
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
        const { unmount } = renderPane({ scope: 'program', viewToggle, programMetricsLoading: false, programMetrics: metrics, blocksPanel });

        const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
        expect(headings).toEqual(['Blocks']);
        expect(screen.queryByText('No goals associated')).not.toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Blocks' })).toBeInTheDocument();
        unmount();

        renderPane({
            scope: 'range', viewToggle, programMetricsLoading: false, programMetrics: { ...metrics, window: { is_partial: true } },
            blocksPanel, selectedRange: { startDate: '2026-09-01', endDate: '2026-09-03' },
        });
        expect(screen.queryByRole('list', { name: 'Blocks' })).not.toBeInTheDocument();
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

    it('puts one Collapse control beside the view toggle on desktop, in every scope', () => {
        const onCollapse = vi.fn();
        const { unmount } = renderPane({ scope: 'program', viewToggle, onCollapse });

        const collapse = screen.getByRole('button', { name: 'Collapse' });
        expect(collapse.closest('div').parentElement).toContainElement(screen.getByRole('tablist', { name: 'Program view' }));
        collapse.click();
        expect(onCollapse).toHaveBeenCalledTimes(1);
        unmount();

        renderPane({
            scope: 'day', viewToggle, onCollapse, contextDate: '2026-09-02',
            dayDetailQuery: { data: { detail: { occurrences: [], sessions: [] } } },
        });
        expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    });

    it('keeps its own headers and a Collapse control in the mobile sheet', () => {
        renderPane({ scope: 'program', onCollapse: vi.fn() });

        expect(screen.getAllByRole('tablist').map((list) => list.getAttribute('aria-label'))).toEqual(['Program side pane views']);
        expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    });
});
