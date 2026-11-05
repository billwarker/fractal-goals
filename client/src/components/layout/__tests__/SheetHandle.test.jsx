import { describe, expect, it } from 'vitest';

import { dragDismisses } from '../SheetHandle';

describe('dragDismisses', () => {
    const sheetHeight = 400;

    it('closes past a quarter of the sheet, however slowly', () => {
        expect(dragDismisses({ distance: 100, speed: 0, sheetHeight })).toBe(true);
    });

    it('slides back from a short, slow drag', () => {
        expect(dragDismisses({ distance: 99, speed: 0.1, sheetHeight })).toBe(false);
    });

    it('closes on a flick, but not on a twitch', () => {
        expect(dragDismisses({ distance: 30, speed: 0.8, sheetHeight })).toBe(true);
        expect(dragDismisses({ distance: 10, speed: 0.8, sheetHeight })).toBe(false);
    });
});
