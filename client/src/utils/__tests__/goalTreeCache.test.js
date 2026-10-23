import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { applyCreatedGoal, goalTreeQueryKeys, insertGoalIntoTree } from '../goalTreeCache';

const tree = {
    id: 'root',
    children: [
        { id: 'long', children: [{ id: 'mid', children: [] }] },
        { id: 'other', children: [] },
    ],
};

describe('insertGoalIntoTree', () => {
    it('appends the goal to its parent and copies only the changed path', () => {
        const goal = { id: 'new', attributes: { id: 'new', parent_id: 'mid' } };
        const next = insertGoalIntoTree(tree, goal);

        expect(next.children[0].children[0].children).toEqual([{ ...goal, children: [] }]);
        expect(next).not.toBe(tree);
        expect(next.children[1]).toBe(tree.children[1]);
        expect(tree.children[0].children[0].children).toEqual([]);
    });

    it('reads a top-level parent_id', () => {
        const next = insertGoalIntoTree(tree, { id: 'new', parent_id: 'root' });
        expect(next.children.map((child) => child.id)).toEqual(['long', 'other', 'new']);
    });

    it('returns the same tree when the parent is missing, the goal exists, or the input is incomplete', () => {
        expect(insertGoalIntoTree(tree, { id: 'new', parent_id: 'missing' })).toBe(tree);
        expect(insertGoalIntoTree(tree, { id: 'mid', parent_id: 'long' })).toBe(tree);
        expect(insertGoalIntoTree(tree, { id: 'new' })).toBe(tree);
        expect(insertGoalIntoTree(null, { id: 'new', parent_id: 'root' })).toBeNull();
    });
});

describe('applyCreatedGoal', () => {
    it('inserts into both goal tree caches and refetches every goal read model', async () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(queryKeys.fractalTree('r'), tree);
        queryClient.setQueryData(queryKeys.goalsTree('r'), tree);
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        await applyCreatedGoal(queryClient, queryKeys, 'r', { id: 'new', parent_id: 'other' });

        [queryKeys.fractalTree('r'), queryKeys.goalsTree('r')].forEach((queryKey) => {
            expect(queryClient.getQueryData(queryKey).children[1].children.map((child) => child.id)).toEqual(['new']);
        });
        const invalidated = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters.queryKey));
        goalTreeQueryKeys(queryKeys, 'r').forEach((queryKey) => {
            expect(invalidated).toContain(JSON.stringify(queryKey));
        });
        expect(invalidated).toContain(JSON.stringify(queryKeys.sessionGoalsViewRoot('r')));
        expect(invalidated).toContain(JSON.stringify(queryKeys.programSessionPlansRoot('r')));
    });

    it('still refetches when the server returned no goal', async () => {
        const queryClient = new QueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        await applyCreatedGoal(queryClient, queryKeys, 'r', null);
        expect(invalidate).toHaveBeenCalledTimes(goalTreeQueryKeys(queryKeys, 'r').length);
    });
});
