export function createProgramCalendarContext(today) {
    return {
        contextProgramId: undefined,
        contextDate: today,
        selectedRange: null,
        pendingBlockSelection: null,
    };
}

export function programCalendarContextReducer(state, action) {
    switch (action.type) {
        case 'focus_day':
            return {
                contextProgramId: action.programId ?? null,
                contextDate: action.date || state.contextDate,
                selectedRange: null,
                pendingBlockSelection: null,
            };
        case 'focus_range':
            return {
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
