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
            <div data-testid="mock-calendar">
                <button type="button" onClick={props.customButtons.contextualToday.click}>
                    Today
                </button>
                <div ref={dayRef} className="fc-daygrid-day" data-date="2026-05-17">
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
});
