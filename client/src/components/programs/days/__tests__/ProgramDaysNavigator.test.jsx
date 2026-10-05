import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import ProgramDaysNavigator from '../ProgramDaysNavigator';

// Program days belong to the program: each is listed once, whichever blocks its dates fall in.
const days = [
    { id: 'd1', name: 'Planche Focus - Day 1', day_of_week: ['Monday'], templates: [{ id: 't1', name: 'Planche Focus' }] },
    { id: 'd2', name: 'Front Lever Focus - Day 2', day_of_week: [], scheduled_dates: ['2026-10-08'], templates: [
        { id: 't2', name: 'Front Lever' }, { id: 't3', name: 'Mobility' },
    ] },
    { id: 'd3', name: 'Rest', day_of_week: [], templates: [] },
];
const occurrencesByDay = new Map([
    ['d1', [{ date: '2026-09-28' }, { date: '2026-10-05' }, { date: '2026-10-12' }]],
    ['d2', [{ date: '2026-10-08' }]],
]);

function renderNavigator(props = {}) {
    return render(
        <ProgramDaysNavigator
            days={days}
            occurrencesByDay={occurrencesByDay}
            today="2026-10-05"
            selectedDayId="d2"
            onSelectDay={vi.fn()}
            onSelectTemplate={vi.fn()}
            {...props}
        />,
    );
}

const dayButton = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('ProgramDaysNavigator', () => {
    it('lists every program day once, with its schedule, templates, and the selection', () => {
        renderNavigator();

        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(dayButton('Front Lever Focus - Day 2')).toHaveAttribute('aria-current', 'true');
        expect(dayButton('Planche Focus - Day 1')).toHaveTextContent('Mon · Next today');
        expect(dayButton('Front Lever Focus - Day 2')).toHaveTextContent('Oct 8 · Next Thu, Oct 8');
        expect(screen.getByRole('list', { name: 'Front Lever Focus - Day 2 templates' }).children).toHaveLength(2);
        // A day without templates stays listed, so a newly created day never disappears.
        expect(dayButton('Rest')).toHaveTextContent('Not scheduled');
        expect(screen.getByText('Add a session template to plan this day.')).toBeInTheDocument();
    });

    it('shows each day\'s dates by status and its consistency', () => {
        const occurrence = (date, state, closed = true) => ({
            date, state, closed, manual_status: null, program_day_completed: state === 'scheduled_met',
        });
        renderNavigator({ occurrencesByDay: new Map([
            ['d1', [
                occurrence('2026-09-21', 'scheduled_met'),
                occurrence('2026-09-28', 'scheduled_missed'),
                occurrence('2026-10-05', 'scheduled_met'),
                occurrence('2026-10-12', 'scheduled_pending', false),
            ]],
            ['d2', [occurrence('2026-10-08', 'scheduled_pending', false)]],
        ]) });

        const counts = screen.getByRole('list', { name: 'Planche Focus - Day 1 results by status' });
        expect(within(counts).getByRole('img', { name: '2 completed' })).toBeInTheDocument();
        expect(within(counts).getByRole('img', { name: '1 missed' })).toBeInTheDocument();
        expect(within(counts).getByRole('img', { name: '4 scheduled in total' })).toBeInTheDocument();
        expect(screen.getByText('67%')).toBeInTheDocument();
        expect(screen.getByText('2/3')).toBeInTheDocument();
        // Nothing completed or missed yet: no consistency figure.
        expect(within(screen.getByRole('list', { name: 'Front Lever Focus - Day 2 results by status' }).parentElement)
            .getByText('—')).toBeInTheDocument();
        // A day without dates has no stats.
        expect(screen.queryByRole('list', { name: 'Rest results by status' })).not.toBeInTheDocument();
    });

    it('creates and edits program days from the side pane', () => {
        const onCreateDay = vi.fn();
        const onEditDay = vi.fn();
        renderNavigator({ onCreateDay, onEditDay });

        fireEvent.click(screen.getByRole('button', { name: 'New program day' }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit Rest' }));

        expect(onCreateDay).toHaveBeenCalledTimes(1);
        expect(onEditDay).toHaveBeenCalledWith(days[2]);
    });

    it('selects a day, or a day and template to bring its plan into view', () => {
        const onSelectDay = vi.fn();
        const onSelectTemplate = vi.fn();
        renderNavigator({ selectedDayId: 'd1', onSelectDay, onSelectTemplate });

        fireEvent.click(dayButton('Front Lever Focus - Day 2'));
        fireEvent.click(screen.getByRole('button', { name: 'Plan Mobility for Front Lever Focus - Day 2' }));

        expect(onSelectDay).toHaveBeenCalledWith('d2');
        expect(onSelectTemplate).toHaveBeenCalledWith('d2', 't3');
    });

    it('explains program days and offers to create one when there are none', () => {
        const onCreateDay = vi.fn();
        renderNavigator({ days: [], selectedDayId: null, onCreateDay });

        expect(screen.getByText(/repeats across the whole program/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New program day' }));
        expect(onCreateDay).toHaveBeenCalledTimes(1);
    });

    it('scopes a day from a click anywhere in its container without overriding its templates', () => {
        const onSelectDay = vi.fn();
        const onSelectTemplate = vi.fn();
        renderNavigator({ selectedDayId: 'd1', onSelectDay, onSelectTemplate });

        fireEvent.click(screen.getByRole('list', { name: 'Front Lever Focus - Day 2 templates' }));
        expect(onSelectDay).toHaveBeenCalledWith('d2');

        onSelectDay.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Plan Mobility for Front Lever Focus - Day 2' }));
        expect(onSelectTemplate).toHaveBeenCalledWith('d2', 't3');
        expect(onSelectDay).not.toHaveBeenCalled();
    });
});
