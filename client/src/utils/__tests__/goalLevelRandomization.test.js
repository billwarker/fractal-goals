import { describe, expect, it, vi } from 'vitest';
import { createRandomLevelColors, createRandomLevelIcons } from '../goalLevelRandomization';

const LEVELS = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal'].map((type) => ({ type }));

describe('goal level randomization', () => {
    it('creates complete coordinated colors and distinct icons', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.25);
        const colors = createRandomLevelColors(LEVELS);
        const icons = createRandomLevelIcons(LEVELS);

        expect(Object.keys(colors)).toEqual(LEVELS.map(({ type }) => type));
        expect(Object.values(colors).every(({ color, secondary_color: secondary }) => /^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(secondary))).toBe(true);
        expect(new Set(Object.values(icons))).toHaveLength(LEVELS.length);
        vi.restoreAllMocks();
    });
});
