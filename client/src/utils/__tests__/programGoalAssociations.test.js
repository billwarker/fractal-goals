import { getGoalDeadline, isGoalAssociatedWithBlock } from '../programGoalAssociations';

describe('programGoalAssociations', () => {
    it('normalizes deadlines from either root or nested attributes', () => {
        expect(getGoalDeadline({ deadline: '2026-03-10T12:00:00Z' })).toBe('2026-03-10');
        expect(getGoalDeadline({ attributes: { deadline: '2026-03-11' } })).toBe('2026-03-11');
        expect(getGoalDeadline(null)).toBeNull();
    });

    it('associates a goal to a block when its deadline falls within the block range', () => {
        const block = {
            start_date: '2026-03-01T00:00:00Z',
            end_date: '2026-03-31T23:59:59Z',
        };

        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-01' }, block)).toBe(true);
        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-15' }, block)).toBe(true);
        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-31' }, block)).toBe(true);
    });

    it('does not associate a goal without deadline or outside the block range', () => {
        const block = {
            start_date: '2026-03-10',
            end_date: '2026-03-20',
        };

        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-09' }, block)).toBe(false);
        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-21' }, block)).toBe(false);
        expect(isGoalAssociatedWithBlock({ attributes: {} }, block)).toBe(false);
        expect(isGoalAssociatedWithBlock({ deadline: '2026-03-15' }, null)).toBe(false);
    });
});
