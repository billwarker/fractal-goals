import { act, renderHook } from '@testing-library/react';
import { useReducer } from 'react';
import { useProgramDayMovePicker } from '../useProgramDayMovePicker';
import { createProgramCalendarContext, programCalendarContextReducer } from '../../utils/programCalendarContext';

const program = { id: 'program', start_date: '2026-09-01', end_date: '2026-09-30' };
const draft = { programId: 'program', dayId: 'day', sourceDate: '2026-09-07', targetDate: '', pending: false };
function setup() {
    const visible = vi.fn();
    const hook = renderHook(() => {
        const [context, dispatch] = useReducer(programCalendarContextReducer,
            programCalendarContextReducer(createProgramCalendarContext('2026-09-07'), {
                type: 'focus_day', date: '2026-09-07', programId: program.id,
            }));
        return { ...useProgramDayMovePicker({ calendarContext: context, dispatchCalendarContext: dispatch,
            program, setIsSidePaneVisible: visible }), context, dispatch };
    });
    return { ...hook, visible };
}

describe('calendar move picker', () => {
    it('lets normal calendar interaction proceed until a move starts', () => {
        const { result } = setup();
        expect(result.current.pickDate('2026-09-08')).toBe(false);
    });
    it('fills the destination while preserving the source scope and preventing event navigation', () => {
        const { result, visible } = setup();
        act(() => result.current.changeDraft(draft));
        const preventDefault = vi.fn();
        act(() => expect(result.current.pickDate('2026-09-08', { preventDefault })).toBe(true));
        expect(result.current.draft.targetDate).toBe('2026-09-08');
        expect(result.current.context.contextDate).toBe('2026-09-07');
        expect(result.current.context.contextProgramId).toBe('program');
        expect(preventDefault).toHaveBeenCalled();
        expect(visible).toHaveBeenCalledWith(true);
    });
    it.each(['2026-09-07', '2026-08-31', '2026-10-01'])('rejects invalid destination %s without losing the draft', (date) => {
        const { result } = setup();
        act(() => result.current.changeDraft(draft));
        act(() => result.current.pickDate(date));
        expect(result.current.draft.error).toMatch(/Choose a different date/);
        expect(result.current.draft.targetDate).toBe('');
        expect(result.current.context.contextDate).toBe('2026-09-07');
    });
    it('keeps the draft when hiding the mobile sheet, then reopens it after picking', () => {
        const { result, visible } = setup();
        act(() => result.current.changeDraft(draft));
        act(() => visible(false));
        expect(visible).toHaveBeenLastCalledWith(false);
        expect(result.current.draft).toEqual(draft);
        act(() => result.current.pickDate('2026-09-08'));
        expect(visible).toHaveBeenLastCalledWith(true);
    });
    it('clears move state on navigation and Escape', () => {
        const { result } = setup();
        act(() => result.current.changeDraft(draft));
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        expect(result.current.draft).toBeNull();
        act(() => result.current.changeDraft(draft));
        act(() => result.current.dispatch({ type: 'focus_day', date: '2026-09-09', programId: program.id }));
        expect(result.current.draft).toBeNull();
    });
    it('ignores calendar picks and Escape while saving', () => {
        const { result } = setup();
        act(() => result.current.changeDraft({ ...draft, pending: true }));
        act(() => result.current.pickDate('2026-09-08'));
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        expect(result.current.draft.targetDate).toBe('');
        expect(result.current.draft.pending).toBe(true);
    });
});
