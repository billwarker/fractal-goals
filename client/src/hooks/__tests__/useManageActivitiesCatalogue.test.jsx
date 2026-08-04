import { renderHook } from '@testing-library/react';

import useManageActivitiesCatalogue from '../useManageActivitiesCatalogue';


describe('useManageActivitiesCatalogue', () => {
    const activityGroups = [{ id: 'group-1', name: 'Strength', parent_id: null, sort_order: 0 }];
    const activities = [{ id: 'activity-1', name: 'Press', group_id: 'group-1' }];
    const circuits = [
        { id: 'circuit-1', name: 'Strength circuit', group_id: 'group-1' },
        { id: 'circuit-2', name: 'Finisher', group_id: null },
    ];

    it('places the selected view items in grouped and ungrouped catalogue buckets', () => {
        const { result } = renderHook(() => useManageActivitiesCatalogue({
            items: circuits,
            activityGroups,
            searchTerm: '',
        }));

        expect(result.current.itemsByGroupMap.get('group-1')).toEqual([circuits[0]]);
        expect(result.current.itemsByGroupMap.get('__ungrouped__')).toEqual([circuits[1]]);
        expect(result.current.resultCount).toBe(3);
    });

    it('searches only the items supplied for the active view', () => {
        const { result, rerender } = renderHook(
            ({ items, searchTerm }) => useManageActivitiesCatalogue({ items, activityGroups, searchTerm }),
            { initialProps: { items: circuits, searchTerm: 'Finisher' } },
        );

        expect(result.current.itemsByGroupMap.get('__ungrouped__')).toEqual([circuits[1]]);

        rerender({ items: activities, searchTerm: 'Strength' });
        expect(result.current.itemsByGroupMap.get('group-1')).toEqual(activities);
        expect(Array.from(result.current.itemsByGroupMap.values()).flat()).not.toContain(circuits[0]);
    });

    it('keeps only populated group branches when empty groups are excluded', () => {
        const nestedGroups = [
            { id: 'root-used', name: 'Training', parent_id: null, sort_order: 0 },
            { id: 'child-used', name: 'Strength', parent_id: 'root-used', sort_order: 0 },
            { id: 'root-empty', name: 'Mobility', parent_id: null, sort_order: 1 },
        ];
        const groupedCircuit = { id: 'circuit-3', name: 'Strength circuit', group_id: 'child-used' };

        const { result } = renderHook(() => useManageActivitiesCatalogue({
            items: [groupedCircuit],
            activityGroups: nestedGroups,
            searchTerm: '',
            includeEmptyGroups: false,
        }));

        expect(result.current.rootGroups.map((group) => group.id)).toEqual(['root-used']);
        expect(result.current.groupChildrenMap.get('root-used').map((group) => group.id)).toEqual(['child-used']);
        expect(result.current.itemsByGroupMap.get('child-used')).toEqual([groupedCircuit]);
    });
});
