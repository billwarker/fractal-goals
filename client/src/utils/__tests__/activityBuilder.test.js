import { buildActivityPayload, prepareActivityDefinitionCopy } from '../activityBuilder';

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

describe('prepareActivityDefinitionCopy', () => {
    it('returns null for missing input', () => {
        expect(prepareActivityDefinitionCopy(null)).toBeNull();
    });

    it('strips ids and deep-copies mutable arrays', () => {
        const source = {
            id: 'activity-1',
            name: 'Scale Practice',
            associated_goal_ids: ['goal-1'],
            metric_definitions: [{ id: 'metric-1', name: 'Speed', unit: 'bpm' }],
            split_definitions: [{ id: 'split-1', name: 'Left Hand' }],
        };

        const copy = prepareActivityDefinitionCopy(source);

        expect(copy).toEqual({
            id: undefined,
            name: 'Scale Practice (Copy)',
            associated_goal_ids: ['goal-1'],
            metric_definitions: [{ id: undefined, name: 'Speed', unit: 'bpm' }],
            split_definitions: [{ id: undefined, name: 'Left Hand' }],
        });

        expect(copy).not.toBe(source);
        expect(copy.metric_definitions).not.toBe(source.metric_definitions);
        expect(copy.metric_definitions[0]).not.toBe(source.metric_definitions[0]);
        expect(copy.split_definitions).not.toBe(source.split_definitions);
        expect(copy.split_definitions[0]).not.toBe(source.split_definitions[0]);
        expect(copy.associated_goal_ids).not.toBe(source.associated_goal_ids);

        copy.metric_definitions[0].name = 'Tempo';
        copy.split_definitions[0].name = 'Right Hand';
        copy.associated_goal_ids.push('goal-2');

        expect(source.metric_definitions[0].name).toBe('Speed');
        expect(source.split_definitions[0].name).toBe('Left Hand');
        expect(source.associated_goal_ids).toEqual(['goal-1']);
    });
});
