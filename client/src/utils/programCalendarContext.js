import { formatLiteralDate, getDatePart } from './dateUtils';

export function formatProgramCalendarRange(startValue, endValue) {
    const startDate = getDatePart(startValue);
    const endDate = getDatePart(endValue);
    if (!startDate || !endDate) return '';
    if (startDate === endDate) return formatLiteralDate(startDate);

    const startYear = startDate.slice(0, 4);
    const startLabel = startYear === endDate.slice(0, 4)
        ? new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', timeZone: 'UTC',
        }).format(new Date(`${startDate}T00:00:00Z`))
        : formatLiteralDate(startDate);

    return `${startLabel} – ${formatLiteralDate(endDate)}`;
}

export function createProgramCalendarContext(today) {
    return {
        scope: 'program',
        contextProgramId: undefined,
        contextDate: today,
        selectedRange: null,
        pendingBlockSelection: null,
    };
}

export function getProgramOverviewMetricsRange({ scope, selectedRange }) {
    if (scope !== 'range' || !selectedRange?.startDate || !selectedRange?.endDate) return null;
    return { start: selectedRange.startDate, end: selectedRange.endDate };
}

export function getNextMultiDayRange({ scope, selectedRange }, clickedDate) {
    const anchorDate = scope === 'range' ? selectedRange?.startDate : clickedDate;
    return {
        startDate: anchorDate && anchorDate < clickedDate ? anchorDate : clickedDate,
        endDate: anchorDate && anchorDate > clickedDate ? anchorDate : clickedDate,
    };
}

export function programCalendarContextReducer(state, action) {
    switch (action.type) {
        case 'focus_program':
            return {
                scope: 'program',
                contextProgramId: action.programId ?? state.contextProgramId ?? null,
                contextDate: action.date || state.contextDate,
                selectedRange: null,
                pendingBlockSelection: null,
            };
        case 'focus_day':
            return {
                scope: 'day',
                contextProgramId: action.programId ?? null,
                contextDate: action.date || state.contextDate,
                selectedRange: null,
                pendingBlockSelection: null,
            };
        case 'focus_range':
            return {
                scope: 'range',
                contextProgramId: action.programId ?? null,
                contextDate: action.startDate || state.contextDate,
                selectedRange: {
                    startDate: action.startDate,
                    endDate: action.endDate || action.startDate,
                    programId: action.programId ?? null,
                },
                pendingBlockSelection: action.pendingBlockSelection || null,
            };
        case 'reset_today':
            return {
                scope: 'program',
                contextProgramId: action.programId ?? null,
                contextDate: action.date || state.contextDate,
                selectedRange: null,
                pendingBlockSelection: null,
            };
        case 'clear_pending_block_selection':
            return {
                ...state,
                pendingBlockSelection: null,
            };
        default:
            return state;
    }
}
