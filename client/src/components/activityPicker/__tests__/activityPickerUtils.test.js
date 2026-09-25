import { getCreateFromSearchState } from '../activityPickerUtils';

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
