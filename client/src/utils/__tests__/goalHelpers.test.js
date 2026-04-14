import { describe, it, expect } from 'vitest';
import { getValidChildTypes, getChildType } from '../goalHelpers';

describe('getValidChildTypes', () => {
    // Macro flexible hierarchy
    it('returns all lower-rank macro types for UltimateGoal', () => {
        const types = getValidChildTypes('UltimateGoal');
        expect(types).toEqual([
            'LongTermGoal',
            'MidTermGoal',
            'ShortTermGoal',
            'ImmediateGoal',
        ]);
    });

    it('returns all lower-rank macro types for LongTermGoal', () => {
        const types = getValidChildTypes('LongTermGoal');
        expect(types).toEqual(['MidTermGoal', 'ShortTermGoal', 'ImmediateGoal']);
    });

    it('returns only ImmediateGoal for ShortTermGoal', () => {
        const types = getValidChildTypes('ShortTermGoal');
        expect(types).toEqual(['ImmediateGoal']);
    });

    it('returns empty array for ImmediateGoal (leaf node)', () => {
        const types = getValidChildTypes('ImmediateGoal');
        expect(types).toEqual([]);
    });

    it('returns empty array for unknown type', () => {
        const types = getValidChildTypes('SomeUnknownType');
        expect(types).toEqual([]);
    });
});

describe('getChildType (shim)', () => {
    it('returns adjacent next type for macro goals', () => {
        expect(getChildType('UltimateGoal')).toBe('LongTermGoal');
        expect(getChildType('LongTermGoal')).toBe('MidTermGoal');
        expect(getChildType('MidTermGoal')).toBe('ShortTermGoal');
        expect(getChildType('ShortTermGoal')).toBe('ImmediateGoal');
    });

    it('returns null for ImmediateGoal', () => {
        expect(getChildType('ImmediateGoal')).toBeNull();
    });
});
