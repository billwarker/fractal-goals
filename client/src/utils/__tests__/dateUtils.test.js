/**
 * Tests for dateUtils utility functions
 */

import { describe, it, expect } from 'vitest';
import {
    getLocalISOString,
    getTodayLocalDate,
    parseAnyDate,
    formatDateInTimezone,
    getDatePart,
    formatLiteralDate
} from '../dateUtils';

describe('getLocalISOString', () => {
    it('returns a valid ISO string', () => {
        const result = getLocalISOString();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('returns current time (within 1 second)', () => {
        const before = Date.now();
        const result = getLocalISOString();
        const after = Date.now();
        const resultTime = new Date(result).getTime();

        expect(resultTime).toBeGreaterThanOrEqual(before);
        expect(resultTime).toBeLessThanOrEqual(after);
    });
});

describe('getTodayLocalDate', () => {
    it('returns a date in YYYY-MM-DD format', () => {
        const result = getTodayLocalDate();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns today\'s date', () => {
        const result = getTodayLocalDate();
        const now = new Date();
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(result).toBe(expected);
    });
});

describe('parseAnyDate', () => {
    it('returns null for null/undefined input', () => {
        expect(parseAnyDate(null)).toBe(null);
        expect(parseAnyDate(undefined)).toBe(null);
    });

    it('parses date-only strings (YYYY-MM-DD) as local midnight', () => {
        const result = parseAnyDate('2024-06-15');
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(5); // June is 5 (0-indexed)
        expect(result.getDate()).toBe(15);
    });

    it('parses datetime with space separator as UTC', () => {
        const result = parseAnyDate('2024-06-15 14:30:00');
        // Should be interpreted as UTC
        expect(result.getUTCFullYear()).toBe(2024);
        expect(result.getUTCMonth()).toBe(5);
        expect(result.getUTCDate()).toBe(15);
        expect(result.getUTCHours()).toBe(14);
        expect(result.getUTCMinutes()).toBe(30);
    });

    it('parses ISO strings without Z as UTC', () => {
        const result = parseAnyDate('2024-06-15T14:30:00');
        expect(result.getUTCFullYear()).toBe(2024);
        expect(result.getUTCHours()).toBe(14);
    });

    it('parses ISO strings with Z correctly', () => {
        const result = parseAnyDate('2024-06-15T14:30:00Z');
        expect(result.getUTCFullYear()).toBe(2024);
        expect(result.getUTCHours()).toBe(14);
    });
});

describe('getDatePart', () => {
    it('returns null for null/undefined input', () => {
        expect(getDatePart(null)).toBe(null);
        expect(getDatePart(undefined)).toBe(null);
    });

    it('returns date-only strings unchanged', () => {
        expect(getDatePart('2024-06-15')).toBe('2024-06-15');
    });

    it('extracts date from ISO strings', () => {
        expect(getDatePart('2024-06-15T14:30:00Z')).toBe('2024-06-15');
        expect(getDatePart('2024-06-15T00:00:00.000Z')).toBe('2024-06-15');
    });

    it('extracts date from Date objects (UTC)', () => {
        const date = new Date(Date.UTC(2024, 5, 15, 12, 0, 0)); // June 15, 2024 12:00 UTC
        expect(getDatePart(date)).toBe('2024-06-15');
    });
});

describe('formatDateInTimezone', () => {
    it('returns empty string for null/undefined', () => {
        expect(formatDateInTimezone(null)).toBe('');
        expect(formatDateInTimezone(undefined)).toBe('');
    });

    it('formats date in specified timezone', () => {
        // UTC midnight on Jan 1, 2024 should show Dec 31, 2023 in LA (UTC-8)
        const result = formatDateInTimezone('2024-01-01T00:00:00Z', 'America/Los_Angeles', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        expect(result).toContain('12/31/2023');
    });

    it('uses default formatting options', () => {
        const result = formatDateInTimezone('2024-06-15T14:30:00Z', 'UTC');
        // Default includes year, month, day, hour, minute
        expect(result).toContain('06/15/2024');
        expect(result).toContain('02:30'); // 14:30 in 12-hour format
    });
});

describe('formatLiteralDate', () => {
    it('returns empty string for null/undefined', () => {
        expect(formatLiteralDate(null)).toBe('');
        expect(formatLiteralDate(undefined)).toBe('');
    });

    it('formats date without timezone shifting', () => {
        // The date should be formatted as given, not shifted
        const result = formatLiteralDate('2024-06-15');
        expect(result).toContain('Jun');
        expect(result).toContain('15');
        expect(result).toContain('2024');
    });

    it('extracts and formats date from ISO strings', () => {
        const result = formatLiteralDate('2024-06-15T23:00:00Z');
        // Should show June 15, not June 16 (even though in some timezones this would be the 16th)
        expect(result).toContain('Jun');
        expect(result).toContain('15');
    });
});
