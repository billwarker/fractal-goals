import { aggregateMetric, aggregateYield, topSetPoint } from '../setAggregation';
import { instanceYield } from '../goalConditionSeries';

const instance = {
    sets: [
        { metrics: [{ metric_id: 'weight', value: 100 }, { metric_id: 'reps', value: 5 }] },
        { metrics: [{ metric_id: 'weight', value: 110 }, { metric_id: 'reps', value: 3 }] },
        { status: 'skipped', metrics: [] },
    ],
};

describe('setAggregation', () => {
    it('takes the top set by the metric direction, or the average', () => {
        expect(aggregateMetric(instance, { id: 'weight' }, 'top')).toBe(110);
        expect(aggregateMetric(instance, { id: 'reps', higher_is_better: false }, 'top')).toBe(3);
        expect(aggregateMetric(instance, { id: 'weight' }, 'average')).toBe(105);
        expect(aggregateMetric({ metrics: [{ metric_id: 'weight', value: '7' }] }, { id: 'weight' })).toBe(7);
        expect(aggregateMetric({ sets: [] }, { id: 'weight' })).toBeNull();
    });

    it('combines per-set yields as the top set, the average, or the total', () => {
        expect(aggregateYield(instance, ['weight', 'reps'], 'top')).toBe(500);
        expect(aggregateYield(instance, ['weight', 'reps'], 'average')).toBe(415);
        expect(aggregateYield(instance, ['weight', 'reps'], 'total')).toBe(830);
        // Goal conditions keep counting the total.
        expect(instanceYield(instance, ['weight', 'reps'])).toBe(830);
        expect(aggregateYield(instance, ['weight'], 'total')).toBeNull();
    });

    it('picks the scatter point of the best set by the ranking metric', () => {
        const points = [{ x: 30, y: 9 }, { x: 36, y: 7 }];
        expect(topSetPoint(points, { id: 'y' })).toEqual({ x: 30, y: 9 });
        expect(topSetPoint(points, { id: 'x', higher_is_better: false })).toEqual({ x: 30, y: 9 });
        expect(topSetPoint([], { id: 'x' })).toBeNull();
    });
});
