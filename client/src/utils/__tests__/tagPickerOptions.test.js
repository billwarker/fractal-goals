import { familiesWithMembers, groupTagsForPicker, toggleTagSelection } from '../tagPickerOptions';

const catalog = {
    families: [
        { id: 'surface', name: 'Surface', sort_order: 1, single_select: false },
        { id: 'grip', name: 'Grip', sort_order: 0, single_select: true },
    ],
    tags: [
        { id: 'paused', name: 'Paused', sort_order: 0 },
        { id: 'narrow', name: 'Narrow', family_id: 'grip', sort_order: 1 },
        { id: 'wide', name: 'Wide', family_id: 'grip', sort_order: 0 },
        { id: 'old', name: 'Old', sort_order: 1, archived: true },
        { id: 'stale', name: 'Stale', family_id: 'deleted-family', sort_order: 2 },
    ],
};

describe('groupTagsForPicker', () => {
    it('orders families, then their tags, and puts unfamilied tags last', () => {
        const groups = groupTagsForPicker(catalog);
        expect(groups.map((group) => [group.label, group.tags.map((tag) => tag.id)])).toEqual([
            ['Grip', ['wide', 'narrow']],
            ['Other tags', ['paused', 'stale']],
        ]);
        expect(groups[0].singleSelect).toBe(true);
    });

    it('keeps assigned archived tags and filters by search', () => {
        expect(groupTagsForPicker(catalog, { keepIds: ['old'] }).at(-1).tags.map((tag) => tag.id)).toContain('old');
        expect(groupTagsForPicker(catalog, { search: 'na' }).map((group) => group.tags.map((tag) => tag.id))).toEqual([['narrow']]);
    });
});

describe('toggleTagSelection', () => {
    const families = familiesWithMembers(catalog);

    it('replaces a single-select sibling and leaves other tags alone', () => {
        expect(toggleTagSelection(['paused', 'wide'], { id: 'narrow', family_id: 'grip' }, families)).toEqual(['paused', 'narrow']);
    });

    it('adds and removes ordinary tags', () => {
        expect(toggleTagSelection(['paused'], { id: 'stale', family_id: 'deleted-family' }, families)).toEqual(['paused', 'stale']);
        expect(toggleTagSelection(['paused', 'wide'], { id: 'wide', family_id: 'grip' }, families)).toEqual(['paused']);
    });
});
