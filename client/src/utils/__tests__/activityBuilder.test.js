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

    it('sanitizes cyclic metric metadata down to API-safe fields', () => {
        const cyclicMetric = {
            id: 'metric-def-1',
            fractal_metric_id: { id: 'metric-lib-1' },
            name: ' Weight ',
            unit: ' lbs ',
            is_best_set_metric: true,
            is_multiplicative: false,
        };
        cyclicMetric.self = cyclicMetric;

        const payload = buildActivityPayload({
            name: 'Bench Press',
            description: '',
            metrics: [cyclicMetric],
            splits: [{ id: 'split-1', name: ' Main Set ', self: cyclicMetric }],
            hasSets: true,
            hasMetrics: true,
            metricsMultiplicative: false,
            hasSplits: true,
            groupId: { id: 'group-1' },
            selectedGoalIds: [{ id: 'goal-1' }, 'goal-2', { bad: true }],
        });

        expect(payload).toEqual({
            name: 'Bench Press',
            description: '',
            metrics: [{
                id: 'metric-def-1',
                fractal_metric_id: 'metric-lib-1',
                name: 'Weight',
                unit: 'lbs',
                is_best_set_metric: true,
                is_multiplicative: false,
                track_progress: true,
                progress_aggregation: null,
            }],
            splits: [{
                id: 'split-1',
                name: 'Main Set',
            }],
            has_sets: true,
            has_metrics: true,
            metrics_multiplicative: false,
            has_splits: true,
            group_id: 'group-1',
            goal_ids: ['goal-1', 'goal-2'],
            track_progress: true,
            progress_aggregation: null,
        });
    });
});

describe('prepareActivityDefinitionCopy', () => {
    it('returns null for missing input', () => {
        expect(prepareActivityDefinitionCopy(null)).toBeNull();
    });

    it('strips ids and deep-copies mutable arrays', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

        const source = {
            id: 'activity-1',
            name: 'Scale Practice',
            description: 'desc',
            has_sets: true,
            has_metrics: true,
            metrics_multiplicative: false,
            has_splits: true,
            group_id: { id: 'group-1' },
            track_progress: false,
            progress_aggregation: 'max',
            associated_goal_ids: ['goal-1'],
            metric_definitions: [{
                id: 'metric-1',
                name: 'Speed',
                unit: 'bpm',
                is_best_set_metric: true,
                is_multiplicative: false,
                track_progress: false,
                progress_aggregation: 'sum',
            }],
            split_definitions: [{ id: 'split-1', name: 'Left Hand' }],
        };

        const copy = prepareActivityDefinitionCopy(source);

        expect(copy).toEqual({
            _builderKey: 1234567890,
            id: undefined,
            name: 'Scale Practice (Copy)',
            description: 'desc',
            has_sets: true,
            has_metrics: true,
            metrics_multiplicative: false,
            has_splits: true,
            group_id: 'group-1',
            track_progress: false,
            progress_aggregation: 'max',
            associated_goal_ids: ['goal-1'],
            metric_definitions: [{
                id: undefined,
                name: 'Speed',
                unit: 'bpm',
                is_best_set_metric: true,
                is_multiplicative: false,
                track_progress: false,
                progress_aggregation: 'sum',
            }],
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

        nowSpy.mockRestore();
    });
});
