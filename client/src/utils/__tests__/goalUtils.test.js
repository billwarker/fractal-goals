import { describe, it, expect } from 'vitest';
import { buildFlattenedGoalTree } from '../goalUtils';

describe('buildFlattenedGoalTree', () => {
    const goalTree = {
        id: 'root',
        completed: false,
        children: [
            {
                id: 'completed-old',
                completed: true,
                children: []
            },
            {
                id: 'completed-in-session',
                completed: true,
                children: []
            },
            {
                id: 'active-child',
                completed: false,
                children: []
            }
        ]
    };

    it('filters completed non-target goals when filterCompleted is true', () => {
        const flattened = buildFlattenedGoalTree(goalTree, new Set(['active-child']), true);
        const ids = flattened.map((node) => node.id);
        expect(ids).toContain('root');
        expect(ids).toContain('active-child');
        expect(ids).not.toContain('completed-old');
        expect(ids).not.toContain('completed-in-session');
    });

    it('keeps completed goals included in sessionCompletedGoalIds', () => {
        const flattened = buildFlattenedGoalTree(
            goalTree,
            new Set(['active-child']),
            true,
            new Set(['completed-in-session'])
        );
        const ids = flattened.map((node) => node.id);
        expect(ids).toContain('completed-in-session');
        expect(ids).not.toContain('completed-old');
    });
});
