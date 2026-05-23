import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProgramGoalSets } from '../useProgramGoalSets';

describe('useProgramGoalSets', () => {
    const goals = [
        {
            id: 'program-root',
            type: 'LongTermGoal',
            name: 'Program Root',
            children: [
                {
                    id: 'shared-child',
                    type: 'MidTermGoal',
                    name: 'Shared Child',
                    children: [
                        {
                            id: 'grandchild',
                            type: 'ShortTermGoal',
                            name: 'Grandchild',
                            children: [],
                        },
                    ],
                },
                {
                    id: 'sibling-child',
                    type: 'MidTermGoal',
                    name: 'Sibling Child',
                    children: [],
                },
            ],
        },
        {
            id: 'shared-child',
            type: 'MidTermGoal',
            name: 'Shared Child',
            children: [
                {
                    id: 'grandchild',
                    type: 'ShortTermGoal',
                    name: 'Grandchild',
                    children: [],
                },
            ],
        },
        {
            id: 'sibling-child',
            type: 'MidTermGoal',
            name: 'Sibling Child',
            children: [],
        },
        {
            id: 'grandchild',
            type: 'ShortTermGoal',
            name: 'Grandchild',
            children: [],
        },
        {
            id: 'block-only',
            type: 'ShortTermGoal',
            name: 'Block Only',
            children: [],
        },
    ];

    const byId = Object.fromEntries(goals.map((goal) => [goal.id, goal]));

    it('builds one canonical attached goal set across program and block associations', () => {
        const { result } = renderHook(() => useProgramGoalSets({
            program: {
                goal_ids: ['program-root'],
                blocks: [
                    { goal_ids: ['shared-child'] },
                    { goal_ids: ['block-only'] },
                ],
            },
            goals,
            getGoalDetails: (goalId) => byId[goalId] || null,
        }));

        expect(result.current.directAssociatedGoalIds).toEqual(['program-root', 'shared-child', 'block-only']);
        expect(Array.from(result.current.attachedGoalIds)).toEqual(['program-root', 'shared-child', 'grandchild', 'sibling-child', 'block-only']);
        expect(result.current.hierarchySeedIds).toEqual(['program-root']);
        expect(result.current.attachableBlockGoalIds).toEqual(['program-root', 'shared-child', 'grandchild', 'sibling-child', 'block-only']);
        expect(result.current.attachableBlockGoals.map((goal) => goal.id)).toEqual(['program-root', 'shared-child', 'grandchild', 'sibling-child', 'block-only']);
        expect(result.current.blockGoalIds).toEqual(['shared-child', 'block-only']);
    });

    it('expands descendants for block-specific metrics and other consumers from one helper', () => {
        const { result } = renderHook(() => useProgramGoalSets({
            program: {
                goal_ids: [],
                blocks: [],
            },
            goals,
            getGoalDetails: (goalId) => byId[goalId] || null,
        }));

        expect(result.current.expandAssociatedGoalIds(['program-root'])).toEqual(['program-root', 'shared-child', 'grandchild', 'sibling-child']);
    });

    it('scopes program hierarchy descendants to the program date window', () => {
        const scopedGoals = [
            {
                id: 'root',
                type: 'LongTermGoal',
                name: 'Root',
                children: [
                    {
                        id: 'before',
                        type: 'MidTermGoal',
                        name: 'Completed Before',
                        completed: true,
                        completed_at: '2026-05-01T12:00:00Z',
                        children: [],
                    },
                    {
                        id: 'during',
                        type: 'MidTermGoal',
                        name: 'Completed During',
                        completed: true,
                        completed_at: '2026-05-24T12:00:00Z',
                        children: [],
                    },
                    {
                        id: 'after',
                        type: 'MidTermGoal',
                        name: 'Completed After',
                        completed: true,
                        completed_at: '2026-06-01T12:00:00Z',
                        children: [],
                    },
                    {
                        id: 'active',
                        type: 'MidTermGoal',
                        name: 'Active',
                        completed: false,
                        children: [],
                    },
                ],
            },
            { id: 'before', type: 'MidTermGoal', name: 'Completed Before', completed: true, completed_at: '2026-05-01T12:00:00Z', children: [] },
            { id: 'during', type: 'MidTermGoal', name: 'Completed During', completed: true, completed_at: '2026-05-24T12:00:00Z', children: [] },
            { id: 'after', type: 'MidTermGoal', name: 'Completed After', completed: true, completed_at: '2026-06-01T12:00:00Z', children: [] },
            { id: 'active', type: 'MidTermGoal', name: 'Active', completed: false, children: [] },
        ];
        const scopedById = Object.fromEntries(scopedGoals.map((goal) => [goal.id, goal]));

        const { result } = renderHook(() => useProgramGoalSets({
            program: {
                start_date: '2026-05-22',
                end_date: '2026-05-26',
                goal_ids: ['root'],
                blocks: [],
            },
            goals: scopedGoals,
            getGoalDetails: (goalId) => scopedById[goalId] || null,
        }));

        expect(Array.from(result.current.attachedGoalIds)).toEqual(['root', 'during', 'active']);
        expect(result.current.hierarchyGoalSeeds).toHaveLength(1);
        expect(result.current.hierarchyGoalSeeds[0].children.map((goal) => goal.id)).toEqual(['during', 'active']);
    });
});
