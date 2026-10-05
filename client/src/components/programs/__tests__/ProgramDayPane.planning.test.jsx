import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProgramDayPane from '../ProgramDayPane';

const occurrence = {
    occurrence_key: 'day-1:2026-09-05',
    program_day_id: 'day-1',
    scheduled_explicitly: true,
    block: { id: 'block-1', name: 'Foundation', color: '#c05a24' },
    name: 'Strength day',
    definition_note: null,
    goal_ids: [],
    requirements: { requirements_met: false, completed_template_ids: [], required_template_ids: [] },
    templates: [],
    credits: [],
};
const program = {
    id: 'program-1', start_date: '2026-09-01', end_date: '2026-09-30',
    blocks: [{ id: 'block-1', name: 'Foundation', start_date: '2026-09-01', end_date: '2026-09-30' }],
    days: [{ id: 'day-1', name: 'Strength day' }, { id: 'day-2', name: 'Mobility' }],
};
const vacation = {
    id: 'p1', name: 'Lisbon', kind: 'vacation', start_date: '2026-09-01', end_date: '2026-09-07',
    protects_streaks: true, notes: null,
};

function renderPane({ date = '2026-09-05', today = '2026-09-02', detail = {}, data = {}, ...props } = {}) {
    const query = { data: {
        periods: [],
        days: [{ date, period_id: null }],
        detail: { occurrences: [occurrence], scheduled: true, sessions: [], requirements: null, ...detail },
        ...data,
    } };
    render(
        <MemoryRouter>
            <ProgramDayPane rootId="root-1" date={date} today={today} query={query} program={program} {...props} />
        </MemoryRouter>,
    );
}

describe('ProgramDayPane planning and events', () => {
    it('offers removal but no further planning on a scheduled future date', () => {
        const onUnscheduleDay = vi.fn();
        renderPane({ onUnscheduleDay });

        // A date holds one program day, so a scheduled date offers no other definitions.
        expect(screen.queryByRole('heading', { name: 'Plan this day' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Schedule Mobility' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove from this date' }));
        expect(onUnscheduleDay).toHaveBeenCalledWith('day-1', '2026-09-05');
    });

    it('offers removal only for explicit schedules on future dates', () => {
        renderPane({ detail: { occurrences: [{ ...occurrence, scheduled_explicitly: false }] } });
        expect(screen.queryByRole('button', { name: 'Remove from this date' })).not.toBeInTheDocument();
    });

    it('explains an excused day and labels the status menu with the event', () => {
        const onEditPeriod = vi.fn();
        renderPane({
            date: '2026-09-03', today: '2026-09-10', onEditPeriod,
            detail: { state: 'rest', status_source: 'period', manual_status: null },
            data: { periods: [vacation], days: [{ date: '2026-09-03', period_id: 'p1' }] },
        });

        const banner = screen.getByRole('region', { name: 'Vacation: Lisbon' });
        expect(banner).toHaveTextContent(/Sep 1\s*–\s*Sep 7\s*· Protecting streaks/);
        expect(banner).toHaveTextContent('Scheduled work wasn’t completed; this day counts as rest.');
        fireEvent.click(within(banner).getByRole('button', { name: 'Edit' }));
        expect(onEditPeriod).toHaveBeenCalledWith(vacation);
        expect(screen.getByRole('button', { name: /Rest \(Lisbon\)/ })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Plan this day' })).not.toBeInTheDocument();
    });

    it('credits a day completed during an event', () => {
        renderPane({
            date: '2026-09-03', today: '2026-09-10',
            detail: { state: 'scheduled_met', status_source: 'automatic' },
            data: { periods: [vacation] },
        });

        expect(screen.getByRole('region', { name: 'Vacation: Lisbon' }))
            .toHaveTextContent('Completed during this event — counts toward your streak.');
    });
});
