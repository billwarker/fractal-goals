// @vitest-environment node
import {
    MAX_QUICK_SESSION_ACTIVITIES,
    addDraftActivities,
    buildQuickSessionPayload,
    createQuickDraft,
    moveDraftActivity,
    recordedValues,
    removeDraftActivity,
    sanitizeMetrics,
    setDraftItemValue,
} from '../createSessionQuickDraft';

const scales = { id: 'activity-1', name: 'Scales', has_sets: true, metric_definitions: [{ id: 'bpm' }] };
const weighIn = { id: 'activity-2', name: 'Weigh-in', has_sets: false, metric_definitions: [{ id: 'weight' }] };

describe('createSessionQuickDraft', () => {
    let counter = 0;
    beforeEach(() => {
        counter = 0;
        vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++counter}`) });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('starts empty and starts the clock when the first activity is added', () => {
        const draft = createQuickDraft();
        expect(draft.items).toEqual([]);
        expect(draft.startedAt).toBeNull();

        const next = addDraftActivities(draft, [{ definition: weighIn }], { now: new Date('2026-11-14T09:30:00Z') });
        expect(next.startedAt).toBe('2026-11-14T09:30:00.000Z');
        const later = addDraftActivities(next, [{ definition: scales }], { now: new Date('2026-11-14T10:00:00Z') });
        expect(later.startedAt).toBe('2026-11-14T09:30:00.000Z');
        expect(later.items.map((item) => item.name)).toEqual(['Weigh-in', 'Scales']);
    });

    it('gives a set activity one empty set to fill, and a set-free one no value yet', () => {
        const [weigh, scale] = addDraftActivities(createQuickDraft(), [{ definition: weighIn }, { definition: scales }]).items;
        expect(weigh).toMatchObject({ activity_definition_id: 'activity-2', has_sets: false, value: null, previous: null });
        expect(scale.value).toEqual({ sets: [{ metrics: [], notes: null }] });
    });

    it('allows the same activity twice and stops at the limit', () => {
        const twice = addDraftActivities(createQuickDraft(), [{ definition: weighIn }, { definition: weighIn }]);
        expect(new Set(twice.items.map((item) => item.key)).size).toBe(2);

        const full = addDraftActivities(
            createQuickDraft(),
            Array.from({ length: MAX_QUICK_SESSION_ACTIVITIES + 3 }, () => ({ definition: weighIn })),
        );
        expect(full.items).toHaveLength(MAX_QUICK_SESSION_ACTIVITIES);
        expect(addDraftActivities(full, [{ definition: weighIn }])).toBe(full);
    });

    it('edits, moves and removes one activity, keeping the rest in order', () => {
        let draft = addDraftActivities(createQuickDraft(), [{ definition: weighIn }, { definition: scales }]);
        const [first, second] = draft.items;
        draft = setDraftItemValue(draft, first.key, { metrics: [{ metric_id: 'weight', value: 82 }] });
        expect(draft.items[0].value.metrics[0].value).toBe(82);
        expect(moveDraftActivity(draft, 0, -1)).toBe(draft);
        expect(moveDraftActivity(draft, 0, 1).items.map((item) => item.key)).toEqual([second.key, first.key]);
        expect(removeDraftActivity(draft, first.key).items.map((item) => item.key)).toEqual([second.key]);
    });

    it('repeats with last time\'s values as placeholders and one empty set per past set', () => {
        const past = {
            metrics: [],
            sets: [
                { metrics: [{ metric_id: 'bpm', value: 60 }], notes: 'clean' },
                { metrics: [{ metric_id: 'bpm', value: 64 }] },
            ],
        };
        const previous = recordedValues(past);
        expect(previous).toEqual({ sets: [
            { metrics: [{ metric_id: 'bpm', value: 60 }], notes: 'clean' },
            { metrics: [{ metric_id: 'bpm', value: 64 }], notes: null },
        ] });
        const [item] = addDraftActivities(createQuickDraft(), [{ definition: scales, previous }]).items;
        expect(item.previous).toBe(previous);
        expect(item.value.sets).toHaveLength(2);
        expect(item.value.sets.every((set) => set.metrics.length === 0)).toBe(true);
        expect(recordedValues({ metric_values: [{ metric_definition_id: 'weight', value: 81.5 }] })).toEqual({
            metrics: [{ metric_id: 'weight', value: 81.5 }],
        });
        expect(recordedValues({ metrics: [{ metric_id: 'weight', value: '' }], sets: [] })).toBeNull();
    });

    it('sends the activities in order with what was entered, leaving out empty sets', () => {
        let draft = addDraftActivities(
            createQuickDraft(), [{ definition: weighIn }, { definition: scales }], { now: new Date('2026-11-14T09:30:00Z') },
        );
        draft = setDraftItemValue(draft, draft.items[0].key, { metrics: [{ metric_id: 'weight', value: 82.4 }], notes: 'morning' });
        draft = setDraftItemValue(draft, draft.items[1].key, { sets: [
            { metrics: [{ metric_id: 'bpm', value: 90 }], notes: null },
            { metrics: [], notes: null },
            { metrics: [], notes: 'felt slow' },
        ] });

        expect(buildQuickSessionPayload(draft)).toEqual({
            name: 'Quick Session',
            session_start: '2026-11-14T09:30:00.000Z',
            activity_instances: [
                {
                    activity_definition_id: 'activity-2', has_sets: false, notes: 'morning',
                    metrics: [{ metric_id: 'weight', value: 82.4 }], sets: [],
                },
                {
                    activity_definition_id: 'activity-1', has_sets: true, notes: '', metrics: [],
                    sets: [
                        { completed: true, metrics: [{ metric_id: 'bpm', value: 90 }], notes: null },
                        { completed: true, metrics: [], notes: 'felt slow' },
                    ],
                },
            ],
        });
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
});
