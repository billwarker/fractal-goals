import { describe, expect, it } from 'vitest';

import {
    formatDateTimeParts,
    formatDurationSeconds,
    formatMetricDisplayValue,
} from '../formatters';

describe('formatDurationSeconds', () => {
    it('formats empty and sub-hour durations consistently', () => {
        expect(formatDurationSeconds(null)).toBe('0m');
        expect(formatDurationSeconds(0)).toBe('0m');
        expect(formatDurationSeconds(3599)).toBe('59m');
    });

    it('formats hour durations without dropping remaining minutes', () => {
        expect(formatDurationSeconds(3660)).toBe('1h 1m');
        expect(formatDurationSeconds(7200)).toBe('2h 0m');
    });
});

describe('formatDateTimeParts', () => {
    it('splits an ISO timestamp into stable date and time labels', () => {
        expect(formatDateTimeParts('2026-06-30T15:45:00Z', 'UTC')).toEqual({
            date: 'Jun 30, 2026',
            time: '3:45 PM',
        });
    });

    it('returns empty labels for missing timestamps', () => {
        expect(formatDateTimeParts(null, 'UTC')).toEqual({ date: '', time: '' });
    });
});

describe('formatMetricDisplayValue', () => {
    it('formats integer and decimal metrics with optional units', () => {
        expect(formatMetricDisplayValue({ name: 'Reps', value: 12, unit: 'count' })).toBe('Reps: 12 count');
        expect(formatMetricDisplayValue({ name: 'Weight', value: 42.25, unit: 'kg' })).toBe('Weight: 42.3 kg');
    });

    it('handles missing names, non-numeric values, and empty metrics', () => {
        expect(formatMetricDisplayValue({ value: 'steady', unit: 'pace' })).toBe('Metric: steady pace');
        expect(formatMetricDisplayValue({ name: 'Notes', value: null })).toBe(null);
        expect(formatMetricDisplayValue(null)).toBe(null);
    });
});
