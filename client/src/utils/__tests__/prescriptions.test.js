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
