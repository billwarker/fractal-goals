import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useProgramCalendarSelection } from '../useProgramCalendarSelection';

const program = { id: 'program-1', start_date: '2026-10-01', end_date: '2026-10-31', blocks: [] };

function setup({ blockCreationMode = true } = {}) {
    const dispatchCalendarContext = vi.fn();
    const setIsSidePaneVisible = vi.fn();
    const { result } = renderHook(() => useProgramCalendarSelection({
        calendarContext: {},
        dispatchCalendarContext,
        displayProgram: program,
        programs: [program],
        today: '2026-10-14',
        blockCreationMode,
        setBlockCreationMode: vi.fn(),
        setIsSidePaneVisible,
    }));
    return { result, dispatchCalendarContext, setIsSidePaneVisible };
}

describe('useProgramCalendarSelection.selectCalendarRange', () => {
    it('accepts a drag selection that has no FullCalendar view', () => {
        const { result, dispatchCalendarContext } = setup();

        expect(() => result.current.selectCalendarRange({ startStr: '2026-10-14', endStr: '2026-10-18' })).not.toThrow();
        expect(dispatchCalendarContext).toHaveBeenCalledWith(expect.objectContaining({
            type: 'focus_range',
            startDate: '2026-10-14',
            endDate: '2026-10-17',
        }));
    });

    it('clears FullCalendar’s own highlight when a view is present', () => {
        const { result } = setup({ blockCreationMode: false });
        const unselect = vi.fn();

        result.current.selectCalendarRange({
            startStr: '2026-10-14',
            endStr: '2026-10-16',
            view: { calendar: { unselect } },
        });

        expect(unselect).toHaveBeenCalled();
    });
});
