import {
    addPlanItem,
    describePlanSource,
    indexPrescriptionsByItemKey,
    movePlanItem,
    removePlanItem,
    setPlanItemPrescription,
} from '../sessionPlanDraft';

const sections = [
    { name: 'Warm-up', items: [{ type: 'activity', activity_definition_id: 'a', item_key: 'k1' }] },
    { name: 'Main', items: [
        { type: 'activity', activity_definition_id: 'b', item_key: 'k2', prescription: { schema: 1, notes: 'x' } },
        { type: 'activity', activity_definition_id: 'c', item_key: 'k3' },
    ] },
];

describe('sessionPlanDraft', () => {
    it('adds activities and circuits flagged as plan additions with fresh keys', () => {
        const withActivity = addPlanItem(sections, 1, { id: 'd', name: 'Dips' });
        const added = withActivity[1].items[2];
        expect(added).toMatchObject({ type: 'activity', activity_definition_id: 'd', name: 'Dips', added_in_plan: true });
        expect(added.item_key).toBeTruthy();

        const withCircuit = addPlanItem(sections, 0, { circuit_definition_id: 'circ', name: 'Finisher' });
        expect(withCircuit[0].items[1]).toMatchObject({ type: 'circuit', circuit_definition_id: 'circ', added_in_plan: true });
        expect(sections[1].items).toHaveLength(2);
    });

    it('moves within bounds and removes items', () => {
        expect(movePlanItem(sections, 1, 0, 1)[1].items.map((item) => item.item_key)).toEqual(['k3', 'k2']);
        expect(movePlanItem(sections, 1, 0, -1)).toEqual(sections);
        expect(removePlanItem(sections, 1, 0)[1].items.map((item) => item.item_key)).toEqual(['k3']);
    });

    it('sets and clears prescriptions', () => {
        const cleared = setPlanItemPrescription(sections, 1, 0, null);
        expect(cleared[1].items[0]).not.toHaveProperty('prescription');
        expect(setPlanItemPrescription(sections, 0, 0, { schema: 1, notes: 'y' })[0].items[0].prescription.notes).toBe('y');
    });

    it('indexes the previous plan by item key and describes the source', () => {
        expect([...indexPrescriptionsByItemKey(sections).keys()]).toEqual(['k2']);
        const format = (value) => `on ${value}`;
        expect(describePlanSource({ source: 'plan' }, format)).toBe('Planned');
        expect(describePlanSource({ source: 'previous_plan', seeded_from_date: 'd' }, format)).toBe('Starts from on d');
        expect(describePlanSource({ source: 'template' }, format)).toBe('Template default');
    });
});
