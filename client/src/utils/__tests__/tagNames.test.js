import cases from '../../../../tests/fixtures/tag_name_normalization_cases.json';
import { canonicalTagName, findTagByName, normalizeTagName } from '../tagNames';

describe('tag names', () => {
    it.each(cases)('matches the server and database for %j', ({ input, display, normalized }) => {
        expect(canonicalTagName(input)).toBe(display);
        expect(normalizeTagName(input)).toBe(normalized);
    });

    it('finds the catalog tag a typed name collides with, archived included', () => {
        const tags = [{ id: 'a', name: 'Warm up', archived: false }, { id: 'b', name: 'Old', archived: true }];
        expect(findTagByName(tags, ' WARM   up ')?.id).toBe('a');
        expect(findTagByName(tags, 'old')?.id).toBe('b');
        expect(findTagByName(tags, '   ')).toBeNull();
        expect(findTagByName(tags, 'new')).toBeNull();
    });
});
