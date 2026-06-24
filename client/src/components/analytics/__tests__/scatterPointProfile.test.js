import { describe, expect, it } from 'vitest';

import { withScatterPointDensity } from '../scatterPointProfile';

describe('withScatterPointDensity', () => {
    it('increases point size as more points occupy the same coordinate', () => {
        const points = withScatterPointDensity([
            { x: 80, y: 7 },
            { x: 80, y: 7 },
            { x: 90, y: 8 },
        ]);

        expect(points.map((point) => point.densityCount)).toEqual([2, 2, 1]);
        expect(points.map((point) => point.pointRadius)).toEqual([11, 11, 8]);
        expect(points.map((point) => point.pointHoverRadius)).toEqual([15, 15, 12]);
    });

    it('caps dense coordinate radii', () => {
        const points = withScatterPointDensity(
            Array.from({ length: 10 }, () => ({ x: 1, y: 1 }))
        );

        expect(points[0].densityCount).toBe(10);
        expect(points[0].pointRadius).toBe(24);
    });
});

