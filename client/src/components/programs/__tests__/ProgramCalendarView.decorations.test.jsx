import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
                data-header-left={props.headerToolbar ? props.headerToolbar.left : ''}
            >
                {props.headerToolbar && props.headerToolbar.left.includes('contextualToday') ? (
                    <button type="button" onClick={props.customButtons.contextualToday.click}>
                        Today
                    </button>
                ) : null}
                <div ref={dayRef} role="gridcell" data-testid="mock-day-cell" className="fc-daygrid-day" data-date="2026-05-17">
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

describe('ProgramCalendarView cell decorations', () => {
    it('re-decorating cells after new events never removes ribbon-owned status marks', () => {
        const dayStates = [{ date: '2026-05-17', state: 'scheduled_pending', scheduled: true, closed: false }];
        const { rerender, props } = renderCalendar({ dayStates, selectedProgramId: 'program-1' });
        const frame = screen.getByTestId('mock-day-cell').querySelector('.fc-daygrid-day-frame');
        // Stand-in for a React-rendered ProgramDayStatusMark inside a ribbon in this cell.
        const ribbonMark = document.createElement('span');
        ribbonMark.setAttribute('data-program-day-status', 'scheduled');
        frame.appendChild(ribbonMark);

        rerender(<ProgramCalendarView {...props} calendarEvents={[{
            id: 'calendar-period-p1', title: 'Lisbon', start: '2026-05-17', end: '2026-05-19',
            extendedProps: { type: 'calendar_period', period: { id: 'p1', protects_streaks: true }, kindLabel: 'Vacation' },
        }]} />);

        expect(frame.contains(ribbonMark)).toBe(true);
        expect(frame.querySelectorAll('[data-program-cell-assistive]')).toHaveLength(1);
    });

    it.each([
        ['start', 3, 'start', null],
        ['member', 3, 'middle', null],
        ['bridge', 3, 'bridge', null],
        ['end', 4, 'end', '4-day streak'],
        ['end', 1, 'end', null],
        ['single', 1, null, null],
        ['none', 0, null, null],
    ])('links %s chain days along the cell top (run %i)', (chainRole, runLength, link, label) => {
        const { rerender, props } = renderCalendar({
            dayStates: [{
                date: '2026-05-17', state: 'scheduled_met', scheduled: true, closed: true,
                chain_role: chainRole, run_length_at_date: runLength,
            }],
            selectedProgramId: 'program-1',
        });
        const cell = screen.getByTestId('mock-day-cell');

        if (link) expect(cell).toHaveAttribute('data-streak-link', link);
        else expect(cell).not.toHaveAttribute('data-streak-link');
        if (label) {
            const streakLabel = cell.querySelector('[data-program-streak-label]');
            expect(streakLabel).toHaveAttribute('title', label);
            expect(streakLabel).toHaveTextContent(`${label.split('-')[0]}d`);
            expect(within(streakLabel).getByText(label)).toBeInTheDocument();
        }
        expect(cell.querySelectorAll('[data-program-streak-label]')).toHaveLength(label ? 1 : 0);

        rerender(<ProgramCalendarView {...props} dayStates={[]} />);
        expect(cell).not.toHaveAttribute('data-streak-link');
        expect(cell).not.toHaveAttribute('data-streak-length');
        expect(cell.querySelectorAll('[data-program-streak-label]')).toHaveLength(0);
    });
});
