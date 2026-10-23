import { describe, expect, it } from 'vitest';

import cases from '../../../../tests/fixtures/goal_deadline_cases.json';
import {
    addInterval,
    deadlineContextForGoal,
    deadlineWarnings,
    describeDeadlineWarning,
    toIsoDate,
} from '../goalDeadlineRules';

describe('goal deadline rules (shared with services/goal_deadline_rules.py)', () => {
    it.each(cases.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
        expect(deadlineWarnings(testCase.deadline, testCase.context)).toEqual(testCase.expected);
    });

    it('reads dates from datetimes and Date objects, rejecting malformed values', () => {
        expect(toIsoDate('2026-05-01T23:30:00Z')).toBe('2026-05-01');
        expect(toIsoDate(new Date('2026-05-01T00:00:00Z'))).toBe('2026-05-01');
        expect(toIsoDate('not a date')).toBeNull();
        expect(toIsoDate(new Date('invalid'))).toBeNull();
        expect(addInterval('2026-01-01', 3, 'fortnights')).toBeNull();
        expect(addInterval('2026-12-31', 1, 'days')).toBe('2027-01-01');
    });

    it('builds the context from the goal, its parent, live children, level and program', () => {
        const context = deadlineContextForGoal(
            { id: 'g', attributes: { started_at: '2026-05-01T00:00:00Z' } },
            {
                parent: { deadline: '2026-05-05' },
                children: [{ deadline: '2026-05-12' }, { attributes: { deadline: '2026-05-30', deleted_at: '2026-05-02' } }],
                level: { deadline_max_value: 1, deadline_max_unit: 'weeks' },
                program: { start_date: '2026-05-01', end_date: '2026-05-09' },
            },
        );
        expect(deadlineWarnings('2026-05-10', context).map((warning) => warning.code)).toEqual([
            'outside_program', 'after_horizon', 'after_parent', 'children_after',
        ]);
        expect(deadlineContextForGoal({ created_at: '2026-01-01' }).started_at).toBe('2026-01-01');
    });

    it('describes every warning in plain language', () => {
        const format = (iso) => `[${iso}]`;
        expect(describeDeadlineWarning({ code: 'after_parent', parent_deadline: '2026-05-05' }, format))
            .toBe('After the parent goal’s due date ([2026-05-05])');
        expect(describeDeadlineWarning({ code: 'children_after', count: 1, latest: '2026-05-12' }, format))
            .toBe('1 child goal is due later (latest [2026-05-12])');
        expect(describeDeadlineWarning({ code: 'children_after', count: 2, latest: '2026-05-12' }, format))
            .toBe('2 child goals are due later (latest [2026-05-12])');
        expect(describeDeadlineWarning({ code: 'outside_program', program_start: 'a', program_end: 'b' }, format))
            .toBe('Outside the program ([a] – [b])');
        expect(describeDeadlineWarning({ code: 'before_horizon', earliest: 'x' }, format)).toMatch(/Sooner/);
        expect(describeDeadlineWarning({ code: 'after_horizon', latest: 'x' }, format)).toMatch(/Later/);
        expect(describeDeadlineWarning({ code: 'unknown' })).toBe('');
    });
});
