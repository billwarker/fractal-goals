import * as model from '../prescriptionModel';
import {
    MAX_PRESCRIPTION_SETS,
    getPrescriptionColumns,
    normalizePrescription,
    summarizePrescription,
    withAddedSet,
    withFlatValue,
    withPrescriptionNotes,
    withRemovedSet,
    withSetNotes,
    withSetValue,
} from '../prescriptionModel';
import {
    PLAN_STATE_MET,
    PLAN_STATE_PENDING,
    PLAN_STATE_UNDER,
    evaluatePlannedMetric,
    formatPlannedValue,
    getPlannedSetNote,
    getPlannedValue,
    prescriptionPlansValues,
} from '../sessionPrescription';

const weight = { id: 'w', name: 'Weight', unit: 'kg' };
const reps = { id: 'r', name: 'Reps', unit: 'reps' };

describe('prescriptionModel', () => {
    it('keeps planned tags on the activity and its sets, and a tags-only plan counts', () => {
        const tagged = model.withPrescriptionTags(null, ['a', 'a', 'b']);
        expect(tagged).toEqual({ schema: 1, tags: ['a', 'b'] });
        const withSet = model.withSetTags(withAddedSet(tagged), 0, ['c']);
        expect(withSet.sets[0].tags).toEqual(['c']);
        expect(summarizePrescription(withSet)).toBe('1 set · tags');
        expect(model.withSetTags(withSet, 0, []).sets[0]).not.toHaveProperty('tags');
        expect(model.withPrescriptionTags({ schema: 1, tags: ['a'] }, [])).toBeNull();
    });

    it('builds columns per metric, and per split × metric for split activities', () => {
        expect(getPrescriptionColumns({ metric_definitions: [weight, reps] }).map((column) => column.key))
            .toEqual(['w', 'r']);
        expect(getPrescriptionColumns({
            has_splits: true,
            metric_definitions: [weight, { ...reps, is_active: false }],
            split_definitions: [{ id: 'R', name: 'Right', order: 1 }, { id: 'L', name: 'Left', order: 0 }],
        }).map((column) => column.key)).toEqual(['L:w', 'R:w']);
    });

    it('adds a set that repeats the last planned set so progression starts from it', () => {
        let plan = withSetValue(null, 0, 'w', null, 100);
        plan = withSetValue(plan, 0, 'r', null, 5);
        plan = withAddedSet(plan);

        expect(plan.sets).toHaveLength(2);
        expect(plan.sets[1].metrics).toEqual(plan.sets[0].metrics);
        expect(plan.sets[1].metrics).not.toBe(plan.sets[0].metrics);
    });

    it('stops adding sets at the server limit', () => {
        const full = { schema: 1, sets: Array.from({ length: MAX_PRESCRIPTION_SETS }, () => ({ metrics: [] })) };
        expect(withAddedSet(full).sets).toHaveLength(MAX_PRESCRIPTION_SETS);
    });

    it('clears a value when the cell is emptied and drops an empty plan entirely', () => {
        const plan = withFlatValue(null, 'w', null, 60);
        expect(plan.metrics).toEqual([{ metric_id: 'w', split_id: null, value: 60 }]);
        expect(withFlatValue(plan, 'w', null, '')).toBeNull();
    });

    it('keeps notes on activities and sets, trimming blanks away', () => {
        let plan = withPrescriptionNotes(null, '  Pause at chest ');
        plan = withAddedSet(plan);
        plan = withSetNotes(plan, 0, 'top set');

        expect(plan).toEqual({ schema: 1, notes: 'Pause at chest', sets: [{ metrics: [], notes: 'top set' }] });
        expect(summarizePrescription(plan)).toBe('1 set · notes');
        expect(withPrescriptionNotes(withRemovedSet(plan, 0), ' ')).toBeNull();
    });

    it('normalizes away legacy empty shapes', () => {
        expect(normalizePrescription({ notes: '', sets: [], metrics: [] })).toBeNull();
    });
});

describe('sessionPrescription', () => {
    const plan = {
        schema: 1,
        sets: [
            { metrics: [{ metric_id: 'w', split_id: null, value: 100 }], notes: 'top set' },
            { metrics: [{ metric_id: 'w', split_id: 'L', value: 50 }] },
        ],
    };

    it('reads planned values per set and split, and nothing beyond the plan', () => {
        expect(getPlannedValue(plan, 'w', { setIndex: 0 })).toBe(100);
        expect(getPlannedValue(plan, 'w', { setIndex: 1, splitId: 'L' })).toBe(50);
        expect(getPlannedValue(plan, 'w', { setIndex: 1 })).toBeNull();
        expect(getPlannedValue(plan, 'w', { setIndex: 2 })).toBeNull();
        expect(getPlannedValue(null, 'w')).toBeNull();
        expect(getPlannedSetNote(plan, 0)).toBe('top set');
        expect(getPlannedSetNote(plan, 1)).toBeNull();
    });

    it('evaluates met and under with the plan value as an inclusive boundary', () => {
        expect(evaluatePlannedMetric({ planned: 100, actual: '', higherIsBetter: true })).toBe(PLAN_STATE_PENDING);
        expect(evaluatePlannedMetric({ planned: 100, actual: 99.5 })).toBe(PLAN_STATE_UNDER);
        expect(evaluatePlannedMetric({ planned: 100, actual: 100 })).toBe(PLAN_STATE_MET);
        expect(evaluatePlannedMetric({ planned: 100, actual: '101' })).toBe(PLAN_STATE_MET);
        expect(evaluatePlannedMetric({ planned: null, actual: 5 })).toBeNull();
    });

    it('treats lower as better only when the metric says so', () => {
        expect(evaluatePlannedMetric({ planned: 300, actual: 295, higherIsBetter: false })).toBe(PLAN_STATE_MET);
        expect(evaluatePlannedMetric({ planned: 300, actual: 301, higherIsBetter: false })).toBe(PLAN_STATE_UNDER);
        expect(evaluatePlannedMetric({ planned: 300, actual: 301, higherIsBetter: null })).toBe(PLAN_STATE_MET);
    });

    it('only suppresses metric defaults when the plan carries values', () => {
        expect(prescriptionPlansValues(plan)).toBe(true);
        expect(prescriptionPlansValues({ schema: 1, notes: 'easy day' })).toBe(false);
        expect(prescriptionPlansValues({ schema: 1, sets: [{ metrics: [] }] })).toBe(false);
    });

    it('formats planned values without padding but keeps fine plate increments', () => {
        expect(formatPlannedValue({ precision: 2 }, 100)).toBe('100');
        expect(formatPlannedValue({ precision: 2 }, 102.25)).toBe('102.25');
        expect(formatPlannedValue({ input_type: 'integer', precision: 0 }, 5)).toBe('5');
        expect(formatPlannedValue({ precision: 2 }, null)).toBe('');
    });
});

describe('circuit plans', () => {

    it('lists a circuit\'s slots in order with their activity definitions', () => {
        const circuit = { slots: [
            { id: 'b', sort_order: 1, activity_definition_id: 'push', activity: { id: 'push', name: 'Push' } },
            { id: 'a', sort_order: 0, activity_definition_id: 'row' },
        ] };
        const slots = model.getCircuitPlanSlots(circuit, new Map([['row', { id: 'row', name: 'Row' }]]));
        expect(slots.map((slot) => [slot.id, slot.definition.name])).toEqual([['a', 'Row'], ['b', 'Push']]);
    });

    it('sets values per round and slot, repeats the last round, and removes rounds', () => {
        let plan = model.withCircuitRoundValue(null, 0, 'a', 'reps', null, 10);
        plan = model.withAddedRound(plan);
        plan = model.withCircuitRoundValue(plan, 1, 'a', 'reps', null, 12);

        expect(model.getCircuitRoundEntries(plan, 0, 'a')).toEqual([{ metric_id: 'reps', split_id: null, value: 10 }]);
        expect(model.getCircuitRoundEntries(plan, 1, 'a')[0].value).toBe(12);
        expect(model.summarizePrescription(plan)).toBe('2 rounds');
        expect(model.withRemovedRound(plan, 0).rounds).toHaveLength(1);
    });

    it('keeps empty rounds (they plan how many rounds to run) and drops an empty plan', () => {
        const plan = model.withAddedRound(model.withAddedRound(null));
        expect(plan.rounds).toEqual([{ slots: [], notes: null }, { slots: [], notes: null }]);
        expect(model.withRemovedRound(model.withRemovedRound(plan, 0), 0)).toBeNull();
        expect(model.withRoundNotes(plan, 1, 'finisher').rounds[1].notes).toBe('finisher');
    });
});
