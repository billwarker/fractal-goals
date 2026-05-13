import { describe, expect, it } from 'vitest';

import {
    createProgramCalendarContext,
    programCalendarContextReducer,
} from '../programCalendarContext';

describe('programCalendarContext', () => {
    it('starts on today without forcing a program context', () => {
        expect(createProgramCalendarContext('2026-05-13')).toEqual({
            contextProgramId: undefined,
            contextDate: '2026-05-13',
            selectedRange: null,
            pendingBlockSelection: null,
        });
    });

    it('focuses a single day and clears range/block-selection state', () => {
        const state = {
            contextProgramId: 'program-1',
            contextDate: '2026-05-17',
            selectedRange: { startDate: '2026-05-17', endDate: '2026-05-23', programId: 'program-1' },
            pendingBlockSelection: { startDate: '2026-05-17', endDate: '2026-05-23' },
        };

        expect(programCalendarContextReducer(state, {
            type: 'focus_day',
            date: '2026-05-14',
            programId: null,
        })).toEqual({
            contextProgramId: null,
            contextDate: '2026-05-14',
            selectedRange: null,
            pendingBlockSelection: null,
        });
    });

    it('focuses a selected block range with an optional add-block affordance', () => {
        const nextState = programCalendarContextReducer(createProgramCalendarContext('2026-05-13'), {
            type: 'focus_range',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            programId: 'program-1',
            pendingBlockSelection: { startDate: '2026-05-17', endDate: '2026-05-23' },
        });

        expect(nextState).toEqual({
            contextProgramId: 'program-1',
            contextDate: '2026-05-17',
            selectedRange: {
                startDate: '2026-05-17',
                endDate: '2026-05-23',
                programId: 'program-1',
            },
            pendingBlockSelection: { startDate: '2026-05-17', endDate: '2026-05-23' },
        });
    });
});
