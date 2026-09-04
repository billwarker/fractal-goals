import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProgramSidePane from '../ProgramSidePane';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3b82f6',
        getGoalSecondaryColor: () => '#172554',
        getGoalIcon: () => 'circle',
    }),
}));

describe('ProgramSidePane day heading', () => {
    it('centers the date between the day navigation controls without a redundant eyebrow', () => {
        const onPreviousDay = vi.fn();
        const onNextDay = vi.fn();
        render(
            <MemoryRouter>
                <ProgramSidePane
                    program={{ id: 'program-1', name: 'Strong Finish' }}
                    goals={[]}
                    scope="day"
                    contextDate="2026-09-02"
                    dayDetailQuery={{ data: { detail: { occurrences: [], other_sessions: [] } } }}
                    blocks={[]}
                    onPreviousDay={onPreviousDay}
                    onNextDay={onNextDay}
                    onProgramScope={vi.fn()}
                    onCollapse={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Wednesday, September 2, 2026' })).toBeInTheDocument();
        expect(screen.queryByText('Day review')).not.toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'requirements met' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
        expect(onPreviousDay).toHaveBeenCalledOnce();
        expect(onNextDay).toHaveBeenCalledOnce();
    });

    it('shows the selected timeframe and scoped overview for a multi-day range', () => {
        render(
            <MemoryRouter>
                <ProgramSidePane
                    program={{ id: 'program-1', name: 'Strong Finish' }}
                    goals={[]}
                    scope="range"
                    selectedRange={{ startDate: '2026-09-02', endDate: '2026-09-08' }}
                    programMetricsLoading
                    onProgramScope={vi.fn()}
                    onCollapse={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Selected timeframe')).toBeInTheDocument();
        expect(screen.getByText('Sep 2 – Sep 8, 2026')).toBeInTheDocument();
        expect(screen.getByText('Loading program overview…')).toBeInTheDocument();
        expect(screen.queryByRole('tablist', { name: 'Program side pane views' })).not.toBeInTheDocument();
    });
});
