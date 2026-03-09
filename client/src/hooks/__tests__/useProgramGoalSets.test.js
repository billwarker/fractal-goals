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
});
