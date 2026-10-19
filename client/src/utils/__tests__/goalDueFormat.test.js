import { describe, expect, it } from 'vitest';

import { describeGoalDue, formatDueDate } from '../goalDueFormat';

const TODAY = '2026-10-19';
const due = (deadline) => describeGoalDue(deadline, TODAY);

describe('describeGoalDue', () => {
    it('reads near dates relatively, at every boundary', () => {
        expect(due('2026-10-19')).toMatchObject({ label: 'Today', tone: 'soon', daysUntil: 0 });
        expect(due('2026-10-20')).toMatchObject({ label: 'Tomorrow', tone: 'soon' });
        expect(due('2026-10-26')).toMatchObject({ label: 'In 7d', tone: 'soon' });
        expect(due('2026-10-27')).toMatchObject({ label: 'In 8d', tone: 'normal' });
        expect(due('2026-11-17')).toMatchObject({ label: 'In 29d', tone: 'normal' });
        expect(due('2026-10-18')).toMatchObject({ label: 'Yesterday', tone: 'overdue' });
        expect(due('2026-09-20')).toMatchObject({ label: '29d overdue', tone: 'overdue' });
    });

    it('switches to the date from 30 days either way, adding the year when it differs', () => {
        expect(due('2026-11-18')).toMatchObject({ label: 'Nov 18', tone: 'normal', daysUntil: 30 });
        expect(due('2026-09-19')).toMatchObject({ label: 'Sep 19', tone: 'overdue' });
        expect(due('2027-01-12').label).toBe('Jan 12, 2027');
    });

    it('describes the date fully for assistive text and tooltips', () => {
        expect(due('2026-10-24').description).toBe('Due Oct 24, 2026 (in 5 days)');
        expect(due('2026-10-20').description).toBe('Due Oct 20, 2026 (in 1 day)');
        expect(due('2026-10-19').description).toBe('Due Oct 19, 2026 (today)');
        expect(due('2026-10-17').description).toBe('Due Oct 17, 2026 (2 days overdue)');
    });

    it('accepts datetimes, crossing month and year ends by calendar day', () => {
        expect(due('2026-10-19T23:59:00Z').label).toBe('Today');
        expect(describeGoalDue('2027-01-01', '2026-12-31').label).toBe('Tomorrow');
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
