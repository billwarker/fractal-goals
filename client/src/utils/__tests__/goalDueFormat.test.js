import { describe, expect, it } from 'vitest';

import { describeGoalDue, formatDueDate } from '../goalDueFormat';

const TODAY = '2026-10-19';
const due = (deadline) => describeGoalDue(deadline, TODAY);

describe('describeGoalDue', () => {
    it('reads as a compact relative time, at every boundary', () => {
        expect(due('2026-10-19')).toMatchObject({ label: 'Today', tone: 'soon', daysUntil: 0 });
        expect(due('2026-10-20')).toMatchObject({ label: '1d', tone: 'soon' });
        expect(due('2026-10-26')).toMatchObject({ label: '7d', tone: 'soon' });
        expect(due('2026-10-27')).toMatchObject({ label: '8d', tone: 'normal' });
        expect(due('2026-11-17')).toMatchObject({ label: '29d', tone: 'normal' });
        expect(due('2026-11-18')).toMatchObject({ label: '1.0mo', tone: 'normal', daysUntil: 30 });
        expect(due('2026-12-31').label).toBe('2.4mo');
        expect(due('2027-10-16').label).toBe('11.9mo');
        expect(due('2027-10-18').label).toBe('1.0y');
        expect(due('2027-10-19').label).toBe('1.0y');
        expect(due('2035-01-01').label).toBe('8.2y');
    });

    it('is negative once overdue', () => {
        expect(due('2026-10-18')).toMatchObject({ label: '-1d', tone: 'overdue' });
        expect(due('2026-09-20')).toMatchObject({ label: '-29d', tone: 'overdue' });
        expect(due('2026-03-01')).toMatchObject({ label: '-7.6mo', tone: 'overdue' });
    });

    it('describes the date fully for assistive text and tooltips', () => {
        expect(due('2026-10-24').description).toBe('Due Oct 24, 2026 (in 5 days)');
        expect(due('2026-10-20').description).toBe('Due Oct 20, 2026 (in 1 day)');
        expect(due('2026-10-19').description).toBe('Due Oct 19, 2026 (today)');
        expect(due('2026-10-17').description).toBe('Due Oct 17, 2026 (2 days overdue)');
    });

    it('accepts datetimes, crossing month and year ends by calendar day', () => {
        expect(due('2026-10-19T23:59:00Z').label).toBe('Today');
        expect(describeGoalDue('2027-01-01', '2026-12-31').label).toBe('1d');
    });

    it('returns nothing without a due date', () => {
        expect(due(null)).toBeNull();
        expect(due('')).toBeNull();
        expect(describeGoalDue('2026-10-19', null)).toBeNull();
    });
});

describe('formatDueDate', () => {
    it('formats short dates, with the year only when it differs from today', () => {
        expect(formatDueDate('2026-10-22', TODAY)).toBe('Oct 22');
        expect(formatDueDate('2027-02-01T00:00:00Z', TODAY)).toBe('Feb 1, 2027');
        expect(formatDueDate(null, TODAY)).toBe('');
    });
});
