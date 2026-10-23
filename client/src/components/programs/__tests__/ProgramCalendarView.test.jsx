import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProgramCalendarView from '../ProgramCalendarView';
import { mockCalendarState } from '../../../test/programs/mockFullCalendar';
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

describe('ProgramCalendarView labels, ranges, and selection', () => {
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

    it('renders a program label on its first day and routes it to the program preview action', async () => {
        const onProgramLabelClick = vi.fn();
        renderCalendar({
            blockLabels: [],
            programLabels: [{
                title: 'Past program', date: '2026-05-17', startDate: '2026-05-17',
                endDate: '2026-06-01', programId: 'past-1', labelType: 'program',
            }],
            onProgramLabelClick,
        });

        fireEvent.click(await screen.findByRole('button', { name: 'View Past program' }));
        expect(onProgramLabelClick).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Past program',
            date: '2026-05-17',
            programId: 'past-1',
            labelType: 'program',
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

    it('reports the rendered month grid as the visible range, once per change', () => {
        const onVisibleRangeChange = vi.fn();
        renderCalendar({ onVisibleRangeChange });
        const datesSet = (startStr, endStr) => mockCalendarState.props.datesSet({
            startStr, endStr, view: { title: 'September 2026', currentStart: new Date(2026, 8, 1) },
        });

        datesSet('2026-08-30T00:00:00', '2026-10-11T00:00:00');
        datesSet('2026-08-30T00:00:00', '2026-10-11T00:00:00');

        expect(onVisibleRangeChange).toHaveBeenCalledTimes(1);
        expect(onVisibleRangeChange).toHaveBeenCalledWith({ start: '2026-08-30', end: '2026-10-10' });
    });

    it('marks only cells in months whose calendar data is still loading', () => {
        const { rerender, props } = renderCalendar({ loadingMonths: new Set(['2026-05']) });
        expect(screen.getByTestId('mock-day-cell')).toHaveAttribute('data-loading', 'true');

        rerender(<ProgramCalendarView {...props} loadingMonths={new Set(['2026-06'])} />);
        expect(screen.getByTestId('mock-day-cell')).not.toHaveAttribute('data-loading');
    });

    it('keeps the Today button wired to context reset', () => {
        const { props } = renderCalendar();

        fireEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(props.onTodayClick).toHaveBeenCalledTimes(1);
    });

    it('accepts goal drops from the Goals pane only when a drop handler is given', () => {
        renderCalendar();
        expect(mockCalendarState.props.droppable).toBe(false);

        const onGoalDueDrop = vi.fn();
        renderCalendar({ onGoalDueDrop });
        expect(mockCalendarState.props.droppable).toBe(true);
        const draggedEl = document.createElement('div');
        draggedEl.dataset.goalId = 'goal-7';
        mockCalendarState.props.drop({ draggedEl, dateStr: '2026-05-21' });
        expect(onGoalDueDrop).toHaveBeenCalledWith('goal-7', '2026-05-21');

        mockCalendarState.props.drop({ draggedEl: document.createElement('div'), dateStr: '2026-05-21' });
        expect(onGoalDueDrop).toHaveBeenCalledTimes(1);
    });

    it('takes no goal drops when read-only', () => {
        renderCalendar({ onGoalDueDrop: vi.fn(), readOnly: true });
        expect(mockCalendarState.props.droppable).toBe(false);
    });

    it('owns multi-day gestures itself instead of FullCalendar selection', () => {
        const onDateClick = vi.fn();
        const { container } = renderCalendar({
            blockCreationMode: true,
            onDateClick,
            dayStates: [{ date: '2026-05-17', state: 'rest', scheduled: false }],
            selectableDates: [{ date: '2026-05-17', scheduled: false }],
        });

        expect(container.querySelector('[data-selection-mode="multiple"]')).toBeInTheDocument();
        expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-selectable', 'false');
        // Unscheduled dates inside the program are selectable in multi-day mode.
        const cell = screen.getByRole('gridcell', { name: '2026-05-17, program date, not selected' });
        cell.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 100 });
        const surface = container.querySelector('[data-selection-mode="multiple"]');
        fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
        fireEvent.pointerUp(surface, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });

        expect(onDateClick).toHaveBeenCalledWith(expect.objectContaining({ dateStr: '2026-05-17' }));
    });

    it('selects scheduled cells without adding checkbox controls', async () => {
        const onDateClick = vi.fn();
        const { container } = renderCalendar({
            blockCreationMode: true,
            selectedStatusDates: ['2026-05-17'],
            onDateClick,
            dayStates: [{ date: '2026-05-17', state: 'scheduled_pending', scheduled: true }],
        });

        expect(container.querySelector('[data-selection-mode="multiple"]')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select Status Days' })).not.toBeInTheDocument();
        const cell = await screen.findByRole('gridcell', { name: '2026-05-17, scheduled program day, selected' });
        expect(cell).toHaveAttribute('aria-selected', 'true');
        expect(cell).toHaveAttribute('tabindex', '0');
        expect(container.querySelector('[data-program-status-date]')).not.toBeInTheDocument();
        fireEvent.keyDown(cell, { key: 'Enter', shiftKey: true });
        expect(onDateClick).toHaveBeenCalledWith(expect.objectContaining({
            dateStr: '2026-05-17',
            jsEvent: expect.objectContaining({ shiftKey: true }),
        }));
        fireEvent.keyDown(cell, { key: ' ' });
        expect(onDateClick).toHaveBeenCalledTimes(2);
    });
});
