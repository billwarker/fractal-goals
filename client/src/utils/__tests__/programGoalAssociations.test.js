import { getGoalDeadline } from '../programGoalAssociations';

describe('programGoalAssociations', () => {
    it('normalizes deadlines from either root or nested attributes', () => {
        expect(getGoalDeadline({ deadline: '2026-03-10T12:00:00Z' })).toBe('2026-03-10');
        expect(getGoalDeadline({ attributes: { deadline: '2026-03-11' } })).toBe('2026-03-11');
        expect(getGoalDeadline(null)).toBeNull();
    });
});
