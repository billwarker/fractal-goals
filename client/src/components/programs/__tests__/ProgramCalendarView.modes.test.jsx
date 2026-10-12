import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProgramCalendarView from '../ProgramCalendarView';
import { mockCalendarApi, mockCalendarState } from '../../../test/programs/mockFullCalendar';
import { renderCalendar } from '../../../test/programs/renderProgramCalendarView';

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('@fullcalendar/react', () => import('../../../test/programs/mockFullCalendar'));
vi.mock('../../atoms/GoalIcon', async () => ({
    default: (await import('../../../test/programs/mockFullCalendar')).MockGoalIcon,
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ProgramCalendarView events, status, and modes', () => {
    it('renders configured SMART goal icons before calendar goal labels', () => {
        const { props } = renderCalendar({
            calendarEvents: [{
                id: 'goal-1',
                title: 'SMART calendar goal',
                backgroundColor: '#8b6fff',
                textColor: '#ffffff',
                extendedProps: {
                    type: 'goal',
                    goalIcon: {
                        shape: 'triangle',
                        color: '#8b6fff',
                        secondaryColor: '#181329',
                        isSmart: true,
                    },
                },
            }],
        });

        const label = screen.getByText('SMART calendar goal');
        const icon = screen.getByTestId('calendar-goal-icon');
        expect(icon).toHaveAttribute('data-shape', 'triangle');
        expect(icon).toHaveAttribute('data-color', '#8b6fff');
        expect(icon).toHaveAttribute('data-secondary-color', '#181329');
        expect(icon).toHaveAttribute('data-smart', 'true');
        expect(icon.closest('[aria-hidden="true"]').nextElementSibling).toBe(label);
        expect(label.parentElement).toHaveStyle({ background: 'transparent' });
        expect(label.parentElement.style.color).toBe('');
        expect(icon.parentElement).not.toHaveAttribute('style');

        fireEvent.click(label);
        expect(props.onEventClick).toHaveBeenCalledTimes(1);
        expect(props.onEventClick).toHaveBeenCalledWith(expect.objectContaining({
            event: expect.objectContaining({ id: 'goal-1' }),
        }));
    });

    it('opens goal deadlines directly from the keyboard without delegated duplicate activation', () => {
        const { props } = renderCalendar({
            calendarEvents: [{
                id: 'goal-keyboard',
                title: 'Keyboard goal',
                extendedProps: { type: 'goal' },
            }],
        });

        const goal = screen.getByRole('button', { name: 'Open goal: Keyboard goal' });
        fireEvent.keyDown(goal, { key: 'Enter' });
        fireEvent.keyDown(goal, { key: ' ' });

        expect(props.onEventClick).toHaveBeenCalledTimes(2);
    });

    it('uses one mobile control row and drives calendar navigation through the API', () => {
        const { props } = renderCalendar({ isMobile: true });

        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
        fireEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(mockCalendarApi.prev).toHaveBeenCalledTimes(1);
        expect(mockCalendarApi.next).toHaveBeenCalledTimes(1);
        expect(mockCalendarApi.today).toHaveBeenCalledTimes(1);
        expect(props.onTodayClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Select Days' })).toBeInTheDocument();
        expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-header-left', '');
    });

    it('expands rows and disables editing affordances in compact read-only mode', () => {
        renderCalendar({
            calendarEvents: [
                {
                    id: 'program-bg-1',
                    start: '2026-05-01',
                    end: '2026-06-01',
                    backgroundColor: '#224466',
                    display: 'background',
                    extendedProps: {
                        type: 'program_background',
                        sortOrder: -20,
                    },
                },
                {
                    id: 'block-bg-1',
                    start: '2026-05-10',
                    end: '2026-05-24',
                    backgroundColor: '#89cff0',
                    display: 'background',
                    extendedProps: {
                        type: 'block_background',
                        sortOrder: -10,
                    },
                },
            ],
            blockCreationMode: true,
            compact: true,
            readOnly: true,
        });

        const calendar = screen.getByTestId('mock-calendar');
        expect(calendar).toHaveAttribute('data-height', '100%');
        expect(calendar).toHaveAttribute('data-expand-rows', 'true');
        expect(calendar).toHaveAttribute('data-day-max-events', '3');
        expect(calendar).toHaveAttribute('data-selectable', 'false');
        expect(screen.getByTestId('mock-day-cell')).toHaveStyle('--program-calendar-cell-color: #89cff0');
        expect(screen.getByTestId('mock-day-cell')).toHaveAttribute('data-calendar-background', 'block');
    });

    it('uses the program color when no block covers the calendar date', () => {
        const { rerender, props } = renderCalendar({
            calendarEvents: [{
                id: 'program-bg-1',
                start: '2026-05-01',
                end: '2026-06-01',
                backgroundColor: '#224466',
                display: 'background',
                extendedProps: { type: 'program_background', sortOrder: -20 },
            }],
        });

        expect(screen.getByTestId('mock-day-cell')).toHaveStyle('--program-calendar-cell-color: #224466');
        expect(screen.getByTestId('mock-day-cell')).toHaveAttribute('data-calendar-background', 'program');

        rerender(<ProgramCalendarView {...props} selectedDate="2026-05-17" />);

        expect(screen.getByTestId('mock-day-cell')).toHaveStyle('--program-calendar-cell-color: #224466');
        expect(screen.getByTestId('mock-day-cell')).toHaveAttribute('data-calendar-background', 'program');
    });

    it('marks every program-day container with its own completion status', () => {
        const { container, rerender, props } = renderCalendar({
            calendarEvents: [
                {
                    id: 'pday-program-1-2026-05-17-practice',
                    title: 'Daily practice',
                    start: '2026-05-17',
                    extendedProps: {
                        type: 'program_day',
                        programId: 'program-1',
                        blockColor: '#663333',
                        isCompleted: true,
                    },
                },
                {
                    id: 'pday-program-1-2026-05-17-review',
                    title: 'Daily review',
                    start: '2026-05-17',
                    extendedProps: {
                        type: 'program_day',
                        programId: 'program-1',
                        blockColor: '#663333',
                        isCompleted: false,
                    },
                },
                {
                    id: 'pday-program-1-2026-05-18-future',
                    title: 'Future practice',
                    start: '2026-05-18',
                    extendedProps: {
                        type: 'program_day',
                        programId: 'program-1',
                        blockColor: '#663333',
                        isCompleted: false,
                    },
                },
            ],
            dayStates: [
                {
                    date: '2026-05-17',
                    state: 'scheduled_partial',
                    scheduled: true,
                    closed: true,
                    chain_role: 'none',
                    breaks_chain: true,
                },
                {
                    date: '2026-05-18',
                    state: 'scheduled_pending',
                    scheduled: true,
                    closed: false,
                    chain_role: 'none',
                    breaks_chain: false,
                },
            ],
            selectedProgramName: 'Strong Finish',
            selectedProgramId: 'program-1',
        });

        const cell = screen.getByTestId('mock-day-cell');
        expect(cell).toHaveAttribute('data-day-state', 'scheduled_partial');
        expect(screen.getByText('Daily practice: requirements met')).toBeInTheDocument();
        expect(screen.getByText('Daily review: missed')).toBeInTheDocument();
        const statusOf = (title) => screen.getByText(title).parentElement
            .querySelector('[data-program-day-status]')?.dataset.programDayStatus;
        expect(statusOf('Daily practice')).toBe('complete');
        expect(statusOf('Daily review')).toBe('missed');
        expect(statusOf('Future practice')).toBe('scheduled');
        expect(container.querySelectorAll('[data-program-day-status]')).toHaveLength(3);
        expect(screen.getByText('Daily practice').parentElement).toHaveStyle({
            '--program-day-pill-bg': 'color-mix(in srgb, #663333 13%, var(--color-bg-card))',
        });

        rerender(<ProgramCalendarView {...props} dayStates={[{
            date: '2026-05-17', state: 'scheduled_met', status_source: 'manual',
            counts_as_success: true, closed: true, scheduled: true, manual_status: 'complete',
        }]} />);
        expect(screen.queryByText('Manual')).not.toBeInTheDocument();
        expect(statusOf('Daily practice')).toBe('complete');

        rerender(<ProgramCalendarView {...props} dayStates={[]} />);

        expect(cell).not.toHaveAttribute('data-day-state');
        expect(screen.getByText('Daily practice: requirements met')).toBeInTheDocument();
        expect(screen.getByText('Daily review: pending')).toBeInTheDocument();
    });

    describe('continuous mode', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 8, 25, 12));
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('offers the Continuous checkbox only when the page can change it', () => {
            const onContinuousChange = vi.fn();
            const { unmount } = renderCalendar();
            expect(screen.queryByRole('checkbox', { name: 'Continuous' })).not.toBeInTheDocument();
            unmount();

            renderCalendar({ onContinuousChange, initialDate: '2026-09-25' });
            const toggle = screen.getByRole('checkbox', { name: 'Continuous' });
            expect(toggle).not.toBeChecked();
            fireEvent.click(toggle);

            expect(onContinuousChange).toHaveBeenCalledWith(true);
        });

        it('renders an unbroken year of weeks centred on today', () => {
            renderCalendar({
                continuous: true,
                onContinuousChange: vi.fn(),
                initialDate: '2026-09-25',
            });

            const calendar = screen.getByTestId('mock-calendar');
            expect(calendar).toHaveAttribute('data-initial-view', 'dayGridContinuous');
            expect(calendar).toHaveAttribute('data-initial-date', '2026-03-22');
            expect(mockCalendarState.props.views).toEqual({
                dayGridContinuous: { type: 'dayGrid', duration: { weeks: 52 } },
            });
            expect(mockCalendarState.props.headerToolbar).toBe(false);
            expect(screen.getByRole('checkbox', { name: 'Continuous' })).toBeChecked();
            expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();

            const { container: firstOfMonth } = render(
                <>{mockCalendarState.props.dayCellContent({ date: new Date(2026, 9, 1), dayNumberText: '1' })}</>,
            );
            expect(firstOfMonth).toHaveTextContent('Oct1');
            expect(screen.getByText('Oct')).toBeInTheDocument();
            // FullCalendar's month-prefixed first cell ("March 22") becomes a plain number.
            expect(mockCalendarState.props.dayCellContent({ date: new Date(2026, 2, 22), dayNumberText: 'March 22' })).toBe('22');
            expect(mockCalendarState.props.dayCellClassNames({ date: new Date(2026, 9, 1), dateStr: '2026-10-01' }))
                .toHaveLength(3);
        });

        it('navigates by scrolling instead of paging within the year', () => {
            const { props } = renderCalendar({
                continuous: true,
                onContinuousChange: vi.fn(),
                initialDate: '2026-09-25',
            });
            const mountsBefore = mockCalendarState.mounts;

            // October and August are inside the year: scroll, no paging, no remount.
            fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
            fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
            expect(mockCalendarApi.next).not.toHaveBeenCalled();
            expect(mockCalendarApi.prev).not.toHaveBeenCalled();
            expect(mockCalendarState.mounts).toBe(mountsBefore);

            fireEvent.click(screen.getByRole('button', { name: 'Today' }));
            expect(mockCalendarApi.today).not.toHaveBeenCalled();
            expect(props.onTodayClick).toHaveBeenCalledTimes(1);
        });

        it('centres the year on a context date beyond it, and Today re-centres on today', () => {
            renderCalendar({ continuous: true, onContinuousChange: vi.fn(), initialDate: '2025-01-15' });
            const calendar = () => screen.getByTestId('mock-calendar');
            expect(calendar()).toHaveAttribute('data-initial-date', '2024-07-14');
            const mountsBefore = mockCalendarState.mounts;

            fireEvent.click(screen.getByRole('button', { name: 'Today' }));

            expect(mockCalendarState.mounts).toBeGreaterThan(mountsBefore);
            expect(calendar()).toHaveAttribute('data-initial-date', '2026-03-22');
        });

        it('keeps FullCalendar\'s own header for compact calendars', () => {
            renderCalendar({ compact: true, readOnly: true, showBlockControls: false });

            expect(screen.getByTestId('mock-calendar').getAttribute('data-header-left')).toContain('contextualToday');
            expect(screen.queryByRole('checkbox', { name: 'Continuous' })).not.toBeInTheDocument();
        });
    });
});
