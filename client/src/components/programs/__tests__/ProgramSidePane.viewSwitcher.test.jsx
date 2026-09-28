import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
                view="details"
                onViewChange={vi.fn()}
                programMetricsLoading
                {...props}
            />
        </MemoryRouter>,
    );
}

describe('ProgramSidePane view switcher', () => {
    it('leads with the page view toggle and puts Details/Goals beneath it in the calendar view', () => {
        renderPane({ scope: 'program', viewToggle, showSubViews: true });

        const tablists = screen.getAllByRole('tablist');
        expect(tablists.map((list) => list.getAttribute('aria-label'))).toEqual(['Program view', 'Program side pane views']);
        expect(within(tablists[1]).getByRole('tab', { name: 'Goals' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    });

    it('hides the Details/Goals sub-toggle outside the calendar view', () => {
        renderPane({ scope: 'program', viewToggle, showSubViews: false });

        expect(screen.getByRole('tablist', { name: 'Program view' })).toBeInTheDocument();
        expect(screen.queryByRole('tablist', { name: 'Program side pane views' })).not.toBeInTheDocument();
    });

    it('keeps the day review heading under the toggle without a collapse control on desktop', () => {
        renderPane({
            scope: 'day',
            viewToggle,
            showSubViews: true,
            contextDate: '2026-09-02',
            dayDetailQuery: { data: { detail: { occurrences: [], sessions: [] } } },
        });

        expect(screen.getByRole('tablist', { name: 'Program view' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Wednesday, September 2, 2026' })).toBeInTheDocument();
        expect(screen.queryByRole('tablist', { name: 'Program side pane views' })).not.toBeInTheDocument();
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

        expect(screen.getByRole('tablist', { name: 'Program side pane views' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    });
});
