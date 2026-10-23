import { describe, expect, it } from 'vitest';

import {
    findGoalNodeById,
    flattenGoalTree,
    flattenSessionGoalsViewGoals,
    getGoalNodeCategory,
    isExecutionGoalNode,
    normalizeGoalNode,
    getGoalConditionSignature,
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
                type: 'ImmediateGoal',
                description: 'Desc',
                completed: true,
                created_at: '2026-03-01T00:00:00Z',
                completed_at: '2026-03-02T00:00:00Z',
                completion_condition: 'activity_threshold',
                condition: { id: 'condition-1', kind: 'single_session' },
                started_at: '2026-03-01T00:00:00Z',
            },
            children: [{ id: 'child-1', type: 'ShortTermGoal', children: [] }],
        };

        expect(normalizeGoalNode(node, { depth: 3, isLinked: true })).toEqual(expect.objectContaining({
            id: 'goal-1',
            name: 'Canonical Goal',
            type: 'ImmediateGoal',
            goalCategory: 'structural',
            description: 'Desc',
            completed: true,
            depth: 3,
            isLinked: true,
            activity_definition_id: 'activity-1',
            parent_id: 'parent-1',
            childrenIds: ['child-1'],
            completion_condition: 'activity_threshold',
            condition: { id: 'condition-1', kind: 'single_session' },
            started_at: '2026-03-01T00:00:00Z',
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

    it('all goal types are structural', () => {
        expect(getGoalNodeCategory('ImmediateGoal')).toBe('structural');
        expect(getGoalNodeCategory('ShortTermGoal')).toBe('structural');
        expect(isExecutionGoalNode({ type: 'ImmediateGoal' })).toBe(false);
        expect(isExecutionGoalNode({ type: 'UltimateGoal' })).toBe(false);
    });

    it('finds nodes by canonical goal id and defaults missing conditions to manual', () => {
        const tree = {
            id: 'root',
            children: [
                {
                    id: 'child',
                    attributes: { type: 'ShortTermGoal' },
                    children: [],
                },
            ],
        };

        expect(findGoalNodeById(tree, 'child')).toBe(tree.children[0]);
        expect(normalizeGoalNode(tree.children[0])).toEqual(expect.objectContaining({
            completion_condition: 'manual',
            condition: null,
        }));
    });

    it('builds condition signatures from full condition content, not only ids', () => {
        const baseGoal = {
            id: 'goal-1',
            completion_condition: 'activity_threshold',
            condition: {
                id: 'condition-1',
                kind: 'single_session',
                rules: [{ metric_definition_id: 'speed', operator: '>=', value: 80 }],
            },
        };
        const editedGoal = {
            ...baseGoal,
            condition: {
                ...baseGoal.condition,
                rules: [{ metric_definition_id: 'speed', operator: '>=', value: 90 }],
            },
        };

        expect(getGoalConditionSignature(baseGoal)).not.toEqual(getGoalConditionSignature(editedGoal));
        expect(getGoalConditionSignature({ ...baseGoal, completion_condition: 'manual', condition: null }))
            .not.toEqual(getGoalConditionSignature(baseGoal));
    });

    it('flattens sessionGoalsView into a deduplicated canonical goal list', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                children: [
                    {
                        id: 'immediate',
                        children: [],
                    },
                ],
            },
        };

        expect(flattenSessionGoalsViewGoals(sessionGoalsView).map((goal) => goal.id)).toEqual([
            'root',
            'immediate',
        ]);
    });
});
