import { prepareCircuitDefinitionCopy } from '../circuitDefinition';

describe('prepareCircuitDefinitionCopy', () => {
    it('creates a detached draft while retaining ordered slot data', () => {
        const source = {
            id: 'circuit-1',
            name: 'Strength Pairing',
            description: 'Alternate movements.',
            group_id: 'group-1',
            version: 3,
            slots: [
                { id: 'slot-1', activity_definition_id: 'activity-1', sort_order: 1 },
                { id: 'slot-2', activity_definition_id: 'activity-1', sort_order: 2 },
            ],
        };

        const copy = prepareCircuitDefinitionCopy(source);

        expect(copy).toEqual(expect.objectContaining({
            id: undefined,
            name: 'Strength Pairing (Copy)',
            description: 'Alternate movements.',
            group_id: 'group-1',
            version: undefined,
        }));
        expect(copy.slots).toEqual([
            expect.objectContaining({ id: undefined, activity_definition_id: 'activity-1', sort_order: 1 }),
            expect.objectContaining({ id: undefined, activity_definition_id: 'activity-1', sort_order: 2 }),
        ]);
        expect(source.slots[0].id).toBe('slot-1');
    });

    it('returns null for a missing source', () => {
        expect(prepareCircuitDefinitionCopy(null)).toBeNull();
    });
});
