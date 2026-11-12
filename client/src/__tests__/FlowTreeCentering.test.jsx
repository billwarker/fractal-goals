import { fitViewportToDrawn } from '../components/flowTree/flowTreeViewport';

const box = { left: 0, top: 0, width: 400, height: 600 };
const insets = { top: 60, right: 16, bottom: 24, left: 16 };

describe('fitViewportToDrawn', () => {
    it('centres a tree drawn left of centre without changing a zoom that already fits', () => {
        // At zoom 1 the tree draws from x 20–300 and y 100–400.
        const next = fitViewportToDrawn({
            drawn: { left: 20, right: 300, top: 100, bottom: 400 },
            box,
            viewport: { x: 0, y: 0, zoom: 1 },
            insets,
        });
        expect(next.zoom).toBe(1);
        // Its centre lands on the clear area's centre (200), and it sits centred below the inset.
        expect(20 * next.zoom + next.x + 280 / 2).toBeCloseTo(200);
        expect(100 + next.y).toBeGreaterThanOrEqual(insets.top);
    });

    it('shrinks a tree drawn taller than the clear area so none of it is hidden', () => {
        const next = fitViewportToDrawn({
            drawn: { left: 40, right: 360, top: 0, bottom: 1032 },
            box,
            viewport: { x: 0, y: 0, zoom: 1 },
            insets,
        });
        // The clear area is 600 - 60 - 24 = 516px tall: half the drawn height.
        expect(next.zoom).toBeCloseTo(0.5);
        expect(next.y).toBeCloseTo(insets.top);
    });

    it('never zooms in past full size, and returns nothing without a drawn tree', () => {
        const small = fitViewportToDrawn({
            drawn: { left: 150, right: 250, top: 200, bottom: 260 },
            box,
            viewport: { x: 0, y: 0, zoom: 1 },
            insets,
        });
        expect(small.zoom).toBe(1);
        expect(fitViewportToDrawn({ drawn: null, box, viewport: { x: 0, y: 0, zoom: 1 }, insets })).toBeNull();
    });
});
