import { buildQueuedQuickSession, sanitizeMetrics, sanitizeSets } from '../createSessionQuickDraft';

describe('createSessionQuickDraft', () => {
    beforeEach(() => {
        vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds set and split metric drafts from activity definitions', () => {
        const draft = buildQueuedQuickSession({
            id: 'template-1',
            name: 'Quick practice',
            template_data: { activities: [{ activity_definition_id: 'activity-1' }] },
        }, [{
            id: 'activity-1',
            name: 'Scales',
            has_sets: true,
            has_splits: true,
            metric_definitions: [{ id: 'metric-1' }],
            split_definitions: [{ id: 'split-1' }, { id: 'split-2' }],
        }]);

        expect(draft.activityInstances[0]).toEqual(expect.objectContaining({
            activity_definition_id: 'activity-1',
            metrics: [],
            sets: [expect.objectContaining({
                metrics: [
                    { metric_id: 'metric-1', split_id: 'split-1', value: '' },
                    { metric_id: 'metric-1', split_id: 'split-2', value: '' },
                ],
            })],
        }));
    });

    it('normalizes entered metric values and removes blank results', () => {
        expect(sanitizeMetrics([
            { metric_id: 'metric-1', value: ' 12.5 ' },
            { metric_id: 'metric-2', value: '' },
            { metric_id: 'metric-3', value: 'steady' },
        ])).toEqual([
            { metric_id: 'metric-1', value: 12.5 },
            { metric_id: 'metric-3', value: 'steady' },
        ]);
    });

    it('sanitizes metrics without mutating the queued sets', () => {
        const sets = [{ instance_id: 'set-1', metrics: [{ metric_id: 'metric-1', value: '4' }] }];
        const sanitized = sanitizeSets(sets);

        expect(sanitized).toEqual([{ instance_id: 'set-1', metrics: [{ metric_id: 'metric-1', value: 4 }] }]);
        expect(sanitized).not.toBe(sets);
        expect(sets[0].metrics[0].value).toBe('4');
    });
});
