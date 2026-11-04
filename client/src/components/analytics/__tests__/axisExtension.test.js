import axisExtension, { canShrink, extendableEnds, extendedLimits, growEnd, headroomExtension, shrinkEnd } from '../axisExtension';

describe('axisExtension', () => {
    it('adds room past the data, never below zero when the data starts there', () => {
        expect(extendedLimits({ min: 4, max: 8 }, { low: 0.25, high: 0.25 })).toEqual({ min: 3, max: 9 });
        expect(extendedLimits({ min: 1, max: 9 }, { low: 0.25, high: 0.25 })).toEqual({ min: 0, max: 11 });
        // Data already below zero (a percent change) keeps going.
        expect(extendedLimits({ min: -10, max: 10 }, { low: 0.5, high: 0 })).toEqual({ min: -20, max: 10 });
        // One point has no range, so its own size stands in.
        expect(extendedLimits({ min: 5, max: 5 }, { low: 0, high: 1 })).toEqual({ min: 5, max: 10 });
        expect(extendedLimits({ min: 0, max: 0 }, { low: 0, high: 1 })).toEqual({ min: 0, max: 1 });
    });

    it('grows one end by half the current range', () => {
        const start = headroomExtension();
        expect(start.y).toEqual({ low: 0.25, high: 0.25 });
        const grown = growEnd(start, 'y', 'high');
        // The range is 1.5× the data's, so half of it is 0.75 more.
        expect(grown.y).toEqual({ low: 0.25, high: 1 });
        expect(grown.x).toEqual(start.x);
    });

    it('pulls an extended end back one step at a time, down to the headroom', () => {
        const start = headroomExtension();
        expect(canShrink(start, 'y', 'high')).toBe(false);
        const once = growEnd(start, 'y', 'high');
        const twice = growEnd(once, 'y', 'high');
        expect(canShrink(twice, 'y', 'high')).toBe(true);
        expect(canShrink(twice, 'y', 'low')).toBe(false);
        expect(shrinkEnd(twice, 'y', 'high').y.high).toBeCloseTo(once.y.high);
        const back = shrinkEnd(once, 'y', 'high');
        expect(back.y.high).toBeCloseTo(0.25);
        expect(canShrink(back, 'y', 'high')).toBe(false);
        expect(shrinkEnd(back, 'y', 'high').y.high).toBe(0.25);
        expect(back.x).toEqual(start.x);
    });

    it('applies to linear scales of a chart that has an extension, leaving others alone', () => {
        const scale = (type, axis, min, max, options = {}) => ({ type, axis, min, max, options });
        const chart = { $axisExtension: headroomExtension() };
        const linear = scale('linear', 'y', 4, 8);
        axisExtension.afterDataLimits(chart, { scale: linear });
        expect([linear.min, linear.max]).toEqual([3, 9]);

        const category = scale('category', 'x', 0, 5);
        axisExtension.afterDataLimits(chart, { scale: category });
        expect([category.min, category.max]).toEqual([0, 5]);

        const untouched = scale('linear', 'y', 4, 8);
        axisExtension.afterDataLimits({}, { scale: untouched });
        expect([untouched.min, untouched.max]).toEqual([4, 8]);

        // An axis drawn from zero is measured from zero.
        const bars = scale('linear', 'x', 5, 10, { beginAtZero: true });
        axisExtension.afterDataLimits({ $axisExtension: { x: { low: 0, high: 0.5 } } }, { scale: bars });
        expect([bars.min, bars.max]).toEqual([0, 15]);
    });

    it('says which ends can extend', () => {
        const scatter = { scales: { x: { type: 'linear', axis: 'x', min: 2, max: 6 }, y: { type: 'linear', axis: 'y', min: 0, max: 9 } } };
        expect(extendableEnds(scatter)).toEqual({ x: { low: true, high: true }, y: { low: false, high: true } });
        const trend = { scales: { x: { type: 'category', axis: 'x' }, metric1: { type: 'linear', axis: 'y', min: 3, max: 9 } } };
        expect(extendableEnds(trend)).toEqual({ x: { low: false, high: false }, y: { low: true, high: true } });
        const running = { ...trend, data: { datasets: [{ runningTotal: {} }] } };
        expect(extendableEnds(running).x).toEqual({ low: false, high: true });
    });
});
