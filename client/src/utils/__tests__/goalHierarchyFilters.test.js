import { describe, expect, it } from 'vitest';

import { hideCompletedBranches } from '../goalHierarchyFilters';

const ids = (nodes) => nodes.map((node) => node.id);

describe('hideCompletedBranches', () => {
    it('drops completed goals whose whole branch is done', () => {
        const nodes = [
            { id: 'root' },
            { id: 'done', parent_id: 'root', completed: true },
            { id: 'done-child', parent_id: 'done', completed: true },
            { id: 'open', parent_id: 'root' },
        ];
        expect(ids(hideCompletedBranches(nodes))).toEqual(['root', 'open']);
    });

    it('keeps a completed goal that still leads to open work, preserving order', () => {
        const nodes = [
            { id: 'root', completed: true },
            { id: 'done', parent_id: 'root', completed: true },
            { id: 'open-child', parent_id: 'done' },
            { id: 'done-sibling', parent_id: 'root', completed: true },
        ];
        expect(ids(hideCompletedBranches(nodes))).toEqual(['root', 'done', 'open-child']);
    });

    it('reads session status, ignores parents outside the list, and handles empty input', () => {
        expect(ids(hideCompletedBranches([
            { id: 'a', parent_id: 'not-listed', status: { completed: false } },
            { id: 'b', status: { completed: true } },
        ]))).toEqual(['a']);
        expect(hideCompletedBranches([])).toEqual([]);
    });
});
