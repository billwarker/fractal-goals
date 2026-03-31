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

    // Execution tier strict enforcement
    it('returns only MicroGoal for ImmediateGoal', () => {
        const types = getValidChildTypes('ImmediateGoal');
        expect(types).toEqual(['MicroGoal']);
    });

    it('returns only NanoGoal for MicroGoal', () => {
        const types = getValidChildTypes('MicroGoal');
        expect(types).toEqual(['NanoGoal']);
    });

    it('returns empty array for NanoGoal (leaf node)', () => {
        const types = getValidChildTypes('NanoGoal');
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

    it('returns MicroGoal for ImmediateGoal', () => {
        expect(getChildType('ImmediateGoal')).toBe('MicroGoal');
    });

    it('returns NanoGoal for MicroGoal', () => {
        expect(getChildType('MicroGoal')).toBe('NanoGoal');
    });

    it('returns null for NanoGoal', () => {
        expect(getChildType('NanoGoal')).toBeNull();
    });
});
