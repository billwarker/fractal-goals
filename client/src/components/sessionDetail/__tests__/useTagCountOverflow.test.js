import { describe, expect, it } from 'vitest';

import { tagsFitInRows } from '../useTagCountOverflow';

describe('tagsFitInRows', () => {
    it('fits exactly at the edge of a row and wraps one pixel past it', () => {
        expect(tagsFitInRows([50, 50], 5, 105, 1)).toBe(true);
        expect(tagsFitInRows([50, 50], 5, 104, 1)).toBe(false);
        expect(tagsFitInRows([50, 50], 5, 104, 2)).toBe(true);
    });

    it('collapses only when a third row would be needed', () => {
        expect(tagsFitInRows([60, 60, 60, 60], 5, 125, 2)).toBe(true);
        expect(tagsFitInRows([60, 60, 60, 60, 60], 5, 125, 2)).toBe(false);
    });

    it('gives one tag wider than the row its own row, since it gets cut off', () => {
        expect(tagsFitInRows([300], 5, 120, 1)).toBe(true);
        expect(tagsFitInRows([300, 50], 5, 120, 2)).toBe(true);
    });

    it('counts the Add Tag button like any other item', () => {
        expect(tagsFitInRows([55, 60, 60], 5, 125, 1)).toBe(false);
        expect(tagsFitInRows([55, 60, 60], 5, 125, 2)).toBe(true);
    });

    it('holds off until there is a width to measure', () => {
        expect(tagsFitInRows([500, 500], 5, 0, 1)).toBe(true);
    });
});
