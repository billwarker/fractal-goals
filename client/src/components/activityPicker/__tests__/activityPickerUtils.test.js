import { getCreateFromSearchState, toggleGroupSelection } from '../activityPickerUtils';

const allActivities = [
    { id: 'a1', name: 'Back Squat' },
    { id: 'a2', name: 'Front  Squat' },
];

describe('getCreateFromSearchState', () => {
    it('offers the prominent create when nothing matches', () => {
        expect(getCreateFromSearchState({ searchText: '  sumo   squat ', results: [], allActivities }))
            .toEqual({ seedName: 'sumo squat', mode: 'empty' });
    });

    it('offers an appended create when only partial matches exist', () => {
        expect(getCreateFromSearchState({ searchText: 'squat', results: allActivities, allActivities }))
            .toEqual({ seedName: 'squat', mode: 'append' });
    });

    it('hides create when a definition with the exact name exists, ignoring case and spacing', () => {
        expect(getCreateFromSearchState({ searchText: 'back squat', results: [allActivities[0]], allActivities }).mode)
            .toBe('none');
        expect(getCreateFromSearchState({ searchText: 'FRONT squat', results: [allActivities[1]], allActivities }).mode)
            .toBe('none');
    });

    it('counts exact matches that are hidden from the visible results', () => {
        expect(getCreateFromSearchState({ searchText: 'Back Squat', results: [], allActivities }).mode).toBe('none');
    });

    it('does nothing for a whitespace-only search', () => {
        expect(getCreateFromSearchState({ searchText: '   ', results: [], allActivities }))
            .toEqual({ seedName: '', mode: 'none' });
    });
});

describe('toggleGroupSelection', () => {
    const byGroup = { a: ['a1', 'a2'], b: ['b1'] };
    const getActivityIdsForGroup = (groupId) => byGroup[groupId] || [];

    it('adds and removes a group with its activities, keeping other picks', () => {
        const added = toggleGroupSelection({ groupIds: [], activityIds: ['x'], groupId: 'a', getActivityIdsForGroup });
        expect([...added.groupIds]).toEqual(['a']);
        expect([...added.activityIds].sort()).toEqual(['a1', 'a2', 'x']);
        const removed = toggleGroupSelection({ groupIds: added.groupIds, activityIds: added.activityIds, groupId: 'a', getActivityIdsForGroup });
        expect([...removed.groupIds]).toEqual([]);
        expect([...removed.activityIds]).toEqual(['x']);
    });

    it('keeps one group in single mode, dropping the previous group and its activities', () => {
        const result = toggleGroupSelection({
            groupIds: ['a'], activityIds: ['a1', 'a2', 'x'], groupId: 'b', getActivityIdsForGroup, single: true,
        });
        expect([...result.groupIds]).toEqual(['b']);
        expect([...result.activityIds].sort()).toEqual(['b1', 'x']);
        const multiple = toggleGroupSelection({ groupIds: ['a'], activityIds: [], groupId: 'b', getActivityIdsForGroup });
        expect([...multiple.groupIds].sort()).toEqual(['a', 'b']);
    });
});
