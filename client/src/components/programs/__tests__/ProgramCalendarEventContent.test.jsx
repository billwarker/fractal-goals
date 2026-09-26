import { render, screen } from '@testing-library/react';

import renderProgramCalendarEventContent from '../ProgramCalendarEventContent';

describe('renderProgramCalendarEventContent', () => {
    it('shows the scheduled status symbol on a program-day container', () => {
        const { container } = render(renderProgramCalendarEventContent(
            { event: { title: 'Planche Focus - Day 1', extendedProps: { type: 'program_day' } } },
            undefined,
            {
                state: 'scheduled_met', scheduled: true, closed: true,
                completed_sessions: [{ id: 's1', name: 'Planche Focus', color: '#336699', relation: 'credited' }],
            },
        ));

        const mark = container.querySelector('[data-program-day-status]');
        expect(mark).toHaveAttribute('data-program-day-status', 'complete');
        expect(mark).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByText(/completed session/i)).not.toBeInTheDocument();
    });

    it('shows the same date status on each program-day container', () => {
        const { container } = render(renderProgramCalendarEventContent(
            { event: { title: 'Other program day', extendedProps: { type: 'program_day' } } },
            undefined,
            { state: 'scheduled_missed', scheduled: true, closed: true },
        ));

        expect(container.querySelector('[data-program-day-status]')).toHaveAttribute(
            'data-program-day-status', 'missed',
        );
    });

    it('shows a completed session on an unscheduled date with its accessible state', () => {
        const { container } = render(renderProgramCalendarEventContent(
            { event: { title: 'Run', extendedProps: { type: 'completed_session' } } },
        ));

        expect(container.firstChild.className).toContain('eventPillCompletedSession');
        expect(container.firstChild).not.toHaveAttribute('style');
        expect(screen.getByText('Run')).toBeInTheDocument();
        expect(screen.getByText('1 completed session: Run')).toBeInTheDocument();
    });

    it('renders a calendar event as a labelled bar that states whether it protects streaks', () => {
        const period = { id: 'p1', name: 'Lisbon', kind: 'vacation', protects_streaks: true };
        const { container, rerender } = render(renderProgramCalendarEventContent({
            event: { title: 'Lisbon', extendedProps: { type: 'calendar_period', period, kindLabel: 'Vacation' } },
        }));

        expect(container.firstChild.className).toContain('eventPillCalendarPeriod');
        expect(container.firstChild).toHaveTextContent('Vacation · Lisbon, protecting streaks');
        rerender(renderProgramCalendarEventContent({
            event: { title: 'Lisbon', extendedProps: { type: 'calendar_period', period: { ...period, protects_streaks: false }, kindLabel: 'Vacation' } },
        }));
        expect(screen.getByText(', streaks not protected')).toBeInTheDocument();
    });
});
