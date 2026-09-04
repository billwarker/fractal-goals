import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProgramCalendarView from '../ProgramCalendarView';

const { mockCalendarApi } = vi.hoisted(() => ({
    mockCalendarApi: {
        next: vi.fn(),
        prev: vi.fn(),
        today: vi.fn(),
    },
}));

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape, color, secondaryColor, isSmart, size }) => (
        <svg
            data-testid="calendar-goal-icon"
            data-shape={shape}
            data-color={color}
            data-secondary-color={secondaryColor}
            data-smart={String(isSmart)}
            data-size={String(size)}
        />
    ),
}));
vi.mock('@fullcalendar/react', async () => {
    const ReactModule = await import('react');

    return {
        default: ReactModule.forwardRef(function MockFullCalendar(props, ref) {
        const dayRef = ReactModule.useRef(null);

        ReactModule.useImperativeHandle(ref, () => ({
            getApi: () => mockCalendarApi,
        }));

        ReactModule.useEffect(() => {
            if (dayRef.current) {
                props.dayCellDidMount?.({ el: dayRef.current });
            }
            return () => {
                if (dayRef.current) {
                    props.dayCellWillUnmount?.({ el: dayRef.current });
                }
            };
        }, [props]);

        return (
            <div
                data-testid="mock-calendar"
                data-height={props.height}
                data-expand-rows={String(Boolean(props.expandRows))}
                data-day-max-events={String(props.dayMaxEvents)}
                data-selectable={String(Boolean(props.selectable))}
                data-select-min-distance={String(props.selectMinDistance)}
                data-header-left={props.headerToolbar.left}
            >
                {props.headerToolbar.left.includes('contextualToday') ? (
                    <button type="button" onClick={props.customButtons.contextualToday.click}>
                        Today
                    </button>
                ) : null}
                <div ref={dayRef} data-testid="mock-day-cell" className="fc-daygrid-day" data-date="2026-05-17">
                    <div className="fc-daygrid-day-frame">
                        <button type="button" data-program-block-label="true">Stale block label</button>
                    </div>
                </div>
                {props.events
                    .filter((event) => event.display !== 'background')
                    .map((event) => {
                        const eventInfo = { event, el: null, view: {} };
                        return (
                        <div
                            key={event.id}
                            className="fc-event"
                            onClick={(jsEvent) => props.eventClick?.({ ...eventInfo, jsEvent })}
                        >
                            {props.eventContent?.({ event })}
                        </div>
                        );
                    })}
            </div>
        );
        }),
    };
});

function renderCalendar(overrides = {}) {
    const props = {
        calendarEvents: [],
        blockLabels: [{
            title: 'Block 1',
            date: '2026-05-17',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            programId: 'program-1',
            blockId: 'block-1',
            color: '#dceaff',
        }],
        blockCreationMode: false,
        setBlockCreationMode: vi.fn(),
        onAddBlockClick: vi.fn(),
        onDateSelect: vi.fn(),
        onDateClick: vi.fn(),
        onEventClick: vi.fn(),
        onBlockLabelClick: vi.fn(),
        onTodayClick: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<ProgramCalendarView {...props} />),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ProgramCalendarView', () => {
    it('renders block labels from metadata and selects the whole block when clicked', async () => {
        const { props } = renderCalendar();

        const label = await screen.findByRole('button', { name: 'Select Block 1' });
        expect(screen.queryByRole('button', { name: 'Stale block label' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Select Block 1' })).toHaveLength(1);
        fireEvent.click(label);

        expect(props.onBlockLabelClick).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Block 1',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            programId: 'program-1',
            blockId: 'block-1',
        }));
    });

    it('reconciles repeated calendar cell mounts without duplicate labels or handlers', async () => {
        const firstHandler = vi.fn();
        const secondHandler = vi.fn();
        const { props, rerender } = renderCalendar({ onBlockLabelClick: firstHandler });

        for (let index = 0; index < 5; index += 1) {
            rerender(
                <ProgramCalendarView
                    {...props}
                    selectedDate={index % 2 ? '2026-05-17' : undefined}
                    onBlockLabelClick={secondHandler}
                />,
            );
        }

        expect(await screen.findAllByRole('button', { name: 'Select Block 1' })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Select Block 1' }));
        expect(firstHandler).not.toHaveBeenCalled();
        expect(secondHandler).toHaveBeenCalledTimes(1);
    });

    it('keeps the Today button wired to context reset', () => {
        const { props } = renderCalendar();

        fireEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(props.onTodayClick).toHaveBeenCalledTimes(1);
    });

    it('marks the entire calendar as a multi-day selection surface while the mode is active', () => {
        const { container } = renderCalendar({ blockCreationMode: true });

        expect(container.querySelector('[data-selection-mode="multiple"]')).toBeInTheDocument();
        expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-selectable', 'true');
        expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-select-min-distance', '5');
    });

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
        expect(calendar).toHaveAttribute('data-select-min-distance', '5');
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

    it('shows an inline completion mark on program-day ribbons and clears stale state', () => {
        const { rerender, props } = renderCalendar({
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
                    closed: true,
                    chain_role: 'none',
                    breaks_chain: true,
                },
                {
                    date: '2026-05-18',
                    state: 'scheduled_pending',
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
        expect(screen.getByRole('img', { name: 'Daily practice: requirements met' })).toHaveTextContent('✓');
        expect(screen.getByRole('img', { name: 'Daily review: missed' })).toHaveTextContent('✗');
        expect(screen.queryByRole('img', { name: /Future practice/ })).not.toBeInTheDocument();
        expect(screen.getByText('Daily practice').parentElement).toHaveStyle({
            '--program-day-pill-bg': 'color-mix(in srgb, #663333 13%, var(--color-bg-card))',
        });

        rerender(<ProgramCalendarView {...props} dayStates={[]} />);

        expect(cell).not.toHaveAttribute('data-day-state');
        expect(screen.getByRole('img', { name: 'Daily practice: requirements met' })).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Daily review: missed' })).not.toBeInTheDocument();
    });
});
