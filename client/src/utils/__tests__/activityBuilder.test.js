import { buildActivityPayload } from '../activityBuilder';

describe('buildActivityPayload', () => {
    it('includes goal_ids and filters blank metrics/splits', () => {
        const payload = buildActivityPayload({
            name: 'Run',
            description: 'desc',
            metrics: [{ name: 'Distance', unit: 'km' }, { name: '   ', unit: 'x' }],
            splits: [{ name: 'Lap 1' }, { name: '   ' }],
            hasSets: false,
            hasMetrics: true,
            metricsMultiplicative: false,
            hasSplits: true,
            groupId: '',
            selectedGoalIds: ['g1', 'g2']
        });

        expect(payload.goal_ids).toEqual(['g1', 'g2']);
        expect(payload.metrics).toHaveLength(1);
        expect(payload.splits).toHaveLength(1);
        expect(payload.group_id).toBeNull();
    });

    it('omits metrics/splits when tracking disabled', () => {
        const payload = buildActivityPayload({
            name: 'Run',
            description: '',
            metrics: [{ name: 'Distance', unit: 'km' }],
            splits: [{ name: 'Lap 1' }],
            hasSets: false,
            hasMetrics: false,
            metricsMultiplicative: false,
            hasSplits: false,
            groupId: 'group-1',
            selectedGoalIds: []
        });

        expect(payload.metrics).toEqual([]);
        expect(payload.splits).toEqual([]);
        expect(payload.group_id).toBe('group-1');
    });
});
