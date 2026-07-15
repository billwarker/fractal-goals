import {
    buildDefinitionMap,
    buildInstanceMap,
    buildPositionMap,
    buildSessionPositionMap,
    normalizeSectionActivityIds,
} from '../sessionSection';

describe('sessionSection map builders', () => {
    it('builds instance and definition lookup maps', () => {
        const instanceMap = buildInstanceMap([{ id: 'i1', activity_definition_id: 'a1' }]);
        const definitionMap = buildDefinitionMap([{ id: 'a1', name: 'Activity 1' }]);

        expect(instanceMap.get('i1')?.activity_definition_id).toBe('a1');
        expect(definitionMap.get('a1')?.name).toBe('Activity 1');
    });

    it('builds stable position map for activity ids', () => {
        const positionMap = buildPositionMap(['x', 'y', 'z']);
        expect(positionMap.get('x')).toBe(0);
        expect(positionMap.get('z')).toBe(2);
    });

    it('builds session-wide positions across sections', () => {
        const positionMap = buildSessionPositionMap([
            { activity_ids: ['warmup'] },
            { activity_ids: ['drill', 'song'] },
        ]);

        expect(positionMap.get('warmup')).toBe(0);
        expect(positionMap.get('drill')).toBe(1);
        expect(positionMap.get('song')).toBe(2);
    });

    it('normalizes legacy definition ids to canonical instance ids across sections', () => {
        const normalized = normalizeSectionActivityIds({
            sections: [
                { name: 'Warmup', activity_ids: ['definition-1'] },
                { name: 'Work', activities: [{ activity_id: 'definition-2' }] },
            ],
        }, [
            { id: 'instance-1', activity_definition_id: 'definition-1' },
            { id: 'instance-2', activity_definition_id: 'definition-2' },
        ]);

        expect(normalized.sections.map((section) => section.activity_ids)).toEqual([
            ['instance-1'],
            ['instance-2'],
        ]);
    });

    it('recovers every canonical instance when a single published section has stale membership', () => {
        const normalized = normalizeSectionActivityIds({
            sections: [{ name: 'Exercises', activity_ids: ['deleted-instance'] }],
        }, [
            { id: 'instance-1', activity_definition_id: 'definition-1' },
            { id: 'instance-2', activity_definition_id: 'definition-2' },
        ]);

        expect(normalized.sections[0].activity_ids).toEqual(['instance-1', 'instance-2']);
    });
});
