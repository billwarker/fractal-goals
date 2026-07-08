import { describe, expect, it } from 'vitest';

import {
    DATE_PRESET_OPTIONS,
    getMatchingPreset,
    presetToRange,
    toISODate,
} from '../dateRange';

describe('dateRange utils', () => {
    it('presetToRange produces today-anchored spans', () => {
        const range = presetToRange('7d');
        expect(range.end).toBe(toISODate(new Date()));
        const expectedStart = new Date();
        expectedStart.setDate(expectedStart.getDate() - 6);
        expect(range.start).toBe(toISODate(expectedStart));
    });

    it('presetToRange for all returns an open range', () => {
        expect(presetToRange('all')).toEqual({ start: null, end: null });
    });

    it('presetToRange for custom defaults to a 30-day span', () => {
        const range = presetToRange('custom');
        expect(range.end).toBe(toISODate(new Date()));
        const expectedStart = new Date();
        expectedStart.setDate(expectedStart.getDate() - 29);
        expect(range.start).toBe(toISODate(expectedStart));
    });

    it('getMatchingPreset round-trips every preset span', () => {
        for (const option of DATE_PRESET_OPTIONS) {
            if (!option.days) continue;
            expect(getMatchingPreset(presetToRange(option.value))).toBe(option.value);
        }
    });

    it('getMatchingPreset detects open, partial, and custom ranges', () => {
        expect(getMatchingPreset({ start: null, end: null })).toBe('all');
        expect(getMatchingPreset({ start: '2026-01-01', end: null })).toBe('custom');
        expect(getMatchingPreset({ start: '2026-01-01', end: '2026-02-01' })).toBe('custom');
    });
});
