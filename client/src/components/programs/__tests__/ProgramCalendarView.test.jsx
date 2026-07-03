import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProgramCalendarView from '../ProgramCalendarView';

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('@fullcalendar/react', async () => {
    const ReactModule = await import('react');

    return {
        default: ReactModule.forwardRef(function MockFullCalendar(props, ref) {
        const dayRef = ReactModule.useRef(null);

        ReactModule.useImperativeHandle(ref, () => ({
            getApi: () => ({
                today: vi.fn(),
            }),
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
            >
                <button type="button" onClick={props.customButtons.contextualToday.click}>
                    Today
                </button>
                <div ref={dayRef} data-testid="mock-day-cell" className="fc-daygrid-day" data-date="2026-05-17">
                    <div className="fc-daygrid-day-frame" />
                </div>
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

describe('ProgramCalendarView', () => {
    it('renders block labels from metadata and selects the whole block when clicked', async () => {
        const { props } = renderCalendar();

        const label = await screen.findByRole('button', { name: 'Select Block 1' });
        fireEvent.click(label);

        expect(props.onBlockLabelClick).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Block 1',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            programId: 'program-1',
            blockId: 'block-1',
        }));
    });

    it('keeps the Today button wired to context reset', () => {
        const { props } = renderCalendar();

        fireEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(props.onTodayClick).toHaveBeenCalledTimes(1);
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
        expect(screen.getByTestId('mock-day-cell')).toHaveStyle('--program-compact-program-bg: #224466');
        expect(screen.getByTestId('mock-day-cell')).toHaveStyle('--program-compact-block-bg: #89cff0');
    });
});
