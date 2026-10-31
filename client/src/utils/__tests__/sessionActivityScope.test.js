import { describe, expect, it } from 'vitest';
import { buildGoalScopeActivityIds, collectGoalScopeIds } from '../sessionActivityScope';

const tree = {
    id: 'root', children: [
        { id: 'song', children: [{ id: 'intro', children: [] }, { id: 'chorus', children: [] }] },
        { id: 'scales', children: [] },
    ],
};

describe('collectGoalScopeIds', () => {
    it('includes the goal and every descendant, not siblings or ancestors', () => {
        expect([...collectGoalScopeIds(tree, 'song')].sort()).toEqual(['chorus', 'intro', 'song']);
        expect([...collectGoalScopeIds(tree, 'intro')]).toEqual(['intro']);
    });

    it('falls back to the goal alone when it is not in the tree', () => {
        expect([...collectGoalScopeIds(tree, 'elsewhere')]).toEqual(['elsewhere']);
        expect([...collectGoalScopeIds(null, 'song')]).toEqual(['song']);
        expect([...collectGoalScopeIds(tree, null)]).toEqual([]);
    });
});

describe('buildGoalScopeActivityIds', () => {
    const scopeGoalIds = collectGoalScopeIds(tree, 'song');

    it('unions the catalog with server and session one-off links, marking only one-off-only ids', () => {
        const result = buildGoalScopeActivityIds({
            catalogActivities: [{ id: 'catalog' }, { id: 'both' }],
            instanceLinkedActivities: [{ id: 'server-linked' }, { id: 'both' }],
            sessionInstances: [
                { activity_definition_id: 'local-child', associated_goal_ids: ['intro'] },
                { activity_definition_id: 'sibling', associated_goal_ids: ['scales'] },
                { activity_definition_id: 'unlinked', associated_goal_ids: [] },
                { activity_definition_id: null, associated_goal_ids: ['song'] },
            ],
            scopeGoalIds,
        });
        expect(result.activityIds.sort()).toEqual(['both', 'catalog', 'local-child', 'server-linked']);
        expect([...result.instanceLinkedIds].sort()).toEqual(['local-child', 'server-linked']);
    });

    it('is the catalog alone with no links (e.g. the link read failed)', () => {
        const result = buildGoalScopeActivityIds({ catalogActivities: [{ id: 1 }], scopeGoalIds });
        expect(result.activityIds).toEqual(['1']);
        expect(result.instanceLinkedIds.size).toBe(0);
    });
});
