import { describe, expect, it } from 'vitest';

import {
    createProgramCalendarContext,
    formatProgramCalendarRange,
    getNextMultiDayRange,
    getProgramOverviewMetricsRange,
    programCalendarContextReducer,
} from '../programCalendarContext';

describe('programCalendarContext', () => {
    it('formats compact single-year, cross-year, and single-day scopes', () => {
        expect(formatProgramCalendarRange('2026-09-02', '2026-09-08')).toBe('Sep 2 – Sep 8, 2026');
        expect(formatProgramCalendarRange('2026-12-31', '2027-01-02')).toBe('Dec 31, 2026 – Jan 2, 2027');
        expect(formatProgramCalendarRange('2026-09-02', '2026-09-02')).toBe('Sep 2, 2026');
    });

    it('starts on today without forcing a program context', () => {
        expect(createProgramCalendarContext('2026-05-13')).toEqual({
            scope: 'program',
            contextProgramId: undefined,
            contextDate: '2026-05-13',
            selectedRange: null,
            pendingBlockSelection: null,
        });
    });

    it('focuses a single day and clears range/block-selection state', () => {
        const state = {
            scope: 'range',
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
            scope: 'day',
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
            scope: 'range',
            contextProgramId: 'program-1',
            contextDate: '2026-05-17',
            selectedRange: {
                startDate: '2026-05-17',
                endDate: '2026-05-23',
                programId: 'program-1',
            },
            pendingBlockSelection: { startDate: '2026-05-17', endDate: '2026-05-23' },
        });
        expect(getProgramOverviewMetricsRange(nextState)).toEqual({
            start: '2026-05-17',
            end: '2026-05-23',
        });
    });

    it('returns to program scope without losing the calendar anchor', () => {
        const state = programCalendarContextReducer(createProgramCalendarContext('2026-05-13'), {
            type: 'focus_day', date: '2026-05-14', programId: 'program-1',
        });
        expect(programCalendarContextReducer(state, { type: 'focus_program' })).toMatchObject({
            scope: 'program', contextDate: '2026-05-14', contextProgramId: 'program-1', selectedRange: null,
        });
        expect(getProgramOverviewMetricsRange(state)).toBeNull();
    });

    it('turns multi-day clicks into an anchored range in either direction', () => {
        const initial = createProgramCalendarContext('2026-05-13');
        expect(getNextMultiDayRange(initial, '2026-05-17')).toEqual({
            startDate: '2026-05-17', endDate: '2026-05-17',
        });
        const anchored = programCalendarContextReducer(initial, {
            type: 'focus_range',
            startDate: '2026-05-17',
            endDate: '2026-05-17',
            programId: 'program-1',
        });
        expect(getNextMultiDayRange(anchored, '2026-05-14')).toEqual({
            startDate: '2026-05-14', endDate: '2026-05-17',
        });
        expect(getNextMultiDayRange(anchored, '2026-05-21')).toEqual({
            startDate: '2026-05-17', endDate: '2026-05-21',
        });
    });
});
