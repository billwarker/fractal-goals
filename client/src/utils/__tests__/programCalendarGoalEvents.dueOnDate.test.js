// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { goalsBadgedOnDate } from '../programCalendarGoalEvents';

describe('goalsBadgedOnDate', () => {
    const event = (start, extendedProps) => ({ start, extendedProps });
    const goal = { id: 'due', name: 'Tuck Planche', type: 'ImmediateGoal' };

    it('returns the goal record, with its level type, not the event props', () => {
        const icon = { shape: 'triangle' };
        const [row] = goalsBadgedOnDate(
            [event('2026-09-02', { type: 'goal', goalId: 'due', goalIcon: icon, goalCompleted: true })],
            '2026-09-02',
            [goal],
        );
        expect(row).toEqual({ goal, icon, completed: true });
        expect(row.goal.type).toBe('ImmediateGoal');
    });

    it('leaves out other dates, reviews, other events and unknown goals', () => {
        expect(goalsBadgedOnDate([
            event('2026-09-03', { type: 'goal', goalId: 'due' }),
            event('2026-09-02', { type: 'goal', goalId: 'due', badgeLabel: 'Review:' }),
            event('2026-09-02', { type: 'session' }),
            event('2026-09-02', { type: 'goal', goalId: 'missing' }),
        ], '2026-09-02', [goal])).toEqual([]);
    });
});
