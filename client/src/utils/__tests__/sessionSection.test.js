import { buildDefinitionMap, buildInstanceMap, buildPositionMap } from '../sessionSection';

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
});
