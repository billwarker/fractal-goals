import { describe, expect, it } from 'vitest';

import { groupsOverlap, instanceGroups, normalizeGroupBy, sessionGroups, setGroups } from '../analyticsGroupBy';
import { groupedBucketRows } from '../chartGrain';

const heavy = { id: 'heavy', name: 'Heavy', family_id: 'load' };
const light = { id: 'light', name: 'Light', family_id: 'load' };
const paused = { id: 'paused', name: 'Paused', family_id: null };
const session = { id: 's1', template_id: 'upper', template_name: 'Upper', program_day_id: null };
const activity = { id: 'bench', name: 'Bench', group_id: 'push' };
const groupsById = new Map([['push', { id: 'push', name: 'Push' }]]);

describe('analytics group-by', () => {
    it('groups an instance by activity, group, template and program day', () => {
        const instance = { id: 'i1', tags: [] };
        const lookups = { activity, groupsById, session };
        expect(instanceGroups(instance, { dimension: 'activity' }, lookups)).toEqual([{ key: 'bench', label: 'Bench' }]);
        expect(instanceGroups(instance, { dimension: 'activityGroup' }, lookups)).toEqual([{ key: 'push', label: 'Push' }]);
        expect(instanceGroups(instance, { dimension: 'activityGroup' }, { activity: { id: 'x' } })).toEqual([{ key: '__none__', label: 'Ungrouped' }]);
        expect(instanceGroups(instance, { dimension: 'template' }, lookups)).toEqual([{ key: 'upper', label: 'Upper' }]);
        expect(instanceGroups(instance, { dimension: 'programDay' }, lookups)).toEqual([{ key: '__none__', label: 'No program day' }]);
        expect(sessionGroups(session, { dimension: 'template' })).toEqual([{ key: 'upper', label: 'Upper' }]);
    });

    it('groups by every tag, or by one family, with Untagged for none', () => {
        const instance = { tags: [heavy, paused, heavy] };
        expect(instanceGroups(instance, { dimension: 'tag' })).toEqual([{ key: 'heavy', label: 'Heavy' }, { key: 'paused', label: 'Paused' }]);
        expect(instanceGroups(instance, { dimension: 'tag', familyId: 'load' })).toEqual([{ key: 'heavy', label: 'Heavy' }]);
        expect(instanceGroups({ tags: [paused] }, { dimension: 'tag', familyId: 'load' })).toEqual([{ key: '__none__', label: 'Untagged' }]);
    });

    it('reads a set’s tags as its own plus its instance’s', () => {
        expect(setGroups({ tags: [light] }, { tags: [paused] }, { dimension: 'tag' }).map((group) => group.key)).toEqual(['light', 'paused']);
        expect(setGroups({ tags: [light] }, { tags: [] }, { dimension: 'template' }, { session })).toEqual([{ key: 'upper', label: 'Upper' }]);
    });

    it('says when groups can overlap: tags, unless one single-select family', () => {
        const families = [{ id: 'load', single_select: true }, { id: 'style', single_select: false }];
        expect(groupsOverlap({ dimension: 'template' }, families)).toBe(false);
        expect(groupsOverlap({ dimension: 'tag', familyId: 'load' }, families)).toBe(false);
        expect(groupsOverlap({ dimension: 'tag', familyId: 'style' }, families)).toBe(true);
        expect(groupsOverlap({ dimension: 'tag' }, families)).toBe(true);
        expect(groupsOverlap(null, families)).toBe(false);
    });

    it('keeps only a dimension the chart offers', () => {
        expect(normalizeGroupBy({ dimension: 'tag', familyId: 'load' }, ['tag'])).toEqual({ dimension: 'tag', familyId: 'load' });
        expect(normalizeGroupBy({ dimension: 'tag' }, ['template'])).toBeNull();
        expect(normalizeGroupBy({ dimension: 'bogus' })).toBeNull();
        expect(normalizeGroupBy(null)).toBeNull();
    });
});

describe('groupedBucketRows', () => {
    it('counts an item in each of its groups while totals count it once', () => {
        const items = [
            { day: '2026-03-02', seconds: 60, tags: [heavy, paused] },
            { day: '2026-03-02', seconds: 30, tags: [] },
        ];
        const result = groupedBucketRows(items, {
            dayOf: (item) => item.day,
            secondsOf: (item) => item.seconds,
            groupsOf: (item) => instanceGroups(item, { dimension: 'tag' }),
        });
        expect(result.rows).toEqual([{ key: '2026-03-02', count: 2, seconds: 90 }]);
        expect(result.groups.map((group) => group.label)).toEqual(['Heavy', 'Paused', 'Untagged']);
        expect(result.values).toEqual(expect.arrayContaining([
            { key: 'heavy', bucket: '2026-03-02', count: 1, seconds: 60 },
            { key: 'paused', bucket: '2026-03-02', count: 1, seconds: 60 },
            { key: '__none__', bucket: '2026-03-02', count: 1, seconds: 30 },
        ]));
    });
});
