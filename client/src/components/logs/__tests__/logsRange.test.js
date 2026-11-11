// @vitest-environment node
import { formatRelativeTime, resolveLogRange } from '../logsRange';

describe('resolveLogRange', () => {
    it('ends a preset today and counts today as its first day', () => {
        expect(resolveLogRange('7', '2026-11-11')).toEqual({ startDate: '2026-11-05', endDate: '2026-11-11' });
        expect(resolveLogRange('30', '2026-03-01')).toEqual({ startDate: '2026-01-31', endDate: '2026-03-01' });
    });

    it('passes custom dates through, open ends included', () => {
        expect(resolveLogRange('custom', '2026-11-11', { startDate: '2026-10-01' }))
            .toEqual({ startDate: '2026-10-01', endDate: '' });
    });
});

describe('formatRelativeTime', () => {
    const now = new Date('2026-11-11T12:00:00Z');

    it.each([
        ['2026-11-11T11:59:30Z', 'just now'],
        ['2026-11-11T11:55:00Z', '5 minutes ago'],
        ['2026-11-11T09:00:00Z', '3 hours ago'],
        ['2026-11-10T12:00:00Z', 'yesterday'],
        ['2026-10-21T12:00:00Z', '3 weeks ago'],
    ])('describes %s as "%s"', (value, expected) => {
        expect(formatRelativeTime(value, now)).toBe(expected);
    });

    it('returns nothing for an unreadable time', () => {
        expect(formatRelativeTime('not a date', now)).toBe('');
    });
});
