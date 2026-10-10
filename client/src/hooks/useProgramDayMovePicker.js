import { useCallback, useEffect } from 'react';
import { formatLiteralDate, getDatePart } from '../utils/dateUtils';

/** Keep the source review open while calendar clicks fill a move destination. */
export function useProgramDayMovePicker({ calendarContext, dispatchCalendarContext, program, setIsSidePaneVisible }) {
    const draft = calendarContext.scope === 'day' && calendarContext.dayMove?.programId === program?.id
        ? calendarContext.dayMove : null;
    const changeDraft = useCallback((next) => {
        dispatchCalendarContext({ type: 'set_day_move', draft: next });
    }, [dispatchCalendarContext]);
    const cancel = useCallback(() => {
        changeDraft(null);
        setIsSidePaneVisible(true);
    }, [changeDraft, setIsSidePaneVisible]);
    useEffect(() => {
        if (!draft || draft.pending) return undefined;
        const escape = (event) => { if (event.key === 'Escape') cancel(); };
        window.addEventListener('keydown', escape);
        return () => window.removeEventListener('keydown', escape);
    }, [draft, cancel]);
    const pickDate = (value, jsEvent) => {
        if (!draft) return false;
        jsEvent?.preventDefault?.();
        if (draft.pending) return true;
        const date = getDatePart(value);
        const start = getDatePart(program.start_date);
        const end = getDatePart(program.end_date);
        if (!date || date === draft.sourceDate || date < start || date > end) {
            changeDraft({ ...draft, error: `Choose a different date between ${formatLiteralDate(start)} and ${formatLiteralDate(end)}.` });
            setIsSidePaneVisible(true);
            return true;
        }
        changeDraft({ ...draft, targetDate: date, error: '' });
        setIsSidePaneVisible(true);
        return true;
    };
    return { draft, changeDraft, pickDate };
}
