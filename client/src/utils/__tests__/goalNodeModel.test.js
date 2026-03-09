import { describe, expect, it } from 'vitest';

import {
    findGoalNodeById,
    flattenGoalTree,
    getGoalNodeCategory,
    isExecutionGoalNode,
    normalizeGoalNode,
    parseGoalTargets,
} from '../goalNodeModel';

describe('goalNodeModel', () => {
    it('normalizes a canonical goal node shape from raw backend data', () => {
        const node = {
            id: 'goal-1',
            name: 'Fallback Name',
            parent_id: 'parent-1',
            activity_definition_id: 'activity-1',
            attributes: {
                name: 'Canonical Goal',
                type: 'MicroGoal',
                description: 'Desc',
                completed: true,
                created_at: '2026-03-01T00:00:00Z',
                completed_at: '2026-03-02T00:00:00Z',
                targets: JSON.stringify([{ id: 'target-1' }]),
            },
            children: [{ id: 'nano-1', type: 'NanoGoal', children: [] }],
        };

        expect(normalizeGoalNode(node, { depth: 3, isLinked: true })).toEqual(expect.objectContaining({
            id: 'goal-1',
            name: 'Canonical Goal',
            type: 'MicroGoal',
            goalCategory: 'execution',
            description: 'Desc',
            completed: true,
            depth: 3,
            isLinked: true,
            activity_definition_id: 'activity-1',
            parent_id: 'parent-1',
            childrenIds: ['nano-1'],
            targets: [{ id: 'target-1' }],
        }));
    });

    it('flattens a tree into canonical nodes with parent lineage', () => {
        const tree = {
            id: 'root',
            type: 'UltimateGoal',
            name: 'Root',
            children: [
                {
                    id: 'child',
                    type: 'ImmediateGoal',
                    name: 'Child',
                    children: [],
                },
            ],
        };

        expect(flattenGoalTree(tree)).toEqual([
            expect.objectContaining({
                id: 'root',
                goalCategory: 'structural',
                depth: 0,
                parent_id: null,
                childrenIds: ['child'],
            }),
            expect.objectContaining({
                id: 'child',
                goalCategory: 'structural',
                depth: 1,
                parent_id: 'root',
                childrenIds: [],
            }),
        ]);
    });

    it('distinguishes execution goals explicitly', () => {
        expect(getGoalNodeCategory('MicroGoal')).toBe('execution');
        expect(getGoalNodeCategory('ImmediateGoal')).toBe('structural');
        expect(isExecutionGoalNode({ type: 'NanoGoal' })).toBe(true);
        expect(isExecutionGoalNode({ type: 'ShortTermGoal' })).toBe(false);
    });

    it('finds nodes by canonical goal id and safely parses target payloads', () => {
        const tree = {
            id: 'root',
            children: [
                {
                    id: 'child',
                    attributes: {
                        type: 'ShortTermGoal',
                        targets: 'not-json',
                    },
                    children: [],
                },
            ],
        };

        expect(findGoalNodeById(tree, 'child')).toBe(tree.children[0]);
        expect(parseGoalTargets(tree.children[0])).toEqual([]);
    });
});
