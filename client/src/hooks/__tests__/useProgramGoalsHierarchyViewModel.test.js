import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProgramGoalsHierarchyViewModel } from '../useProgramGoalsHierarchyViewModel';

describe('useProgramGoalsHierarchyViewModel', () => {
    it('flattens program goal seeds into a depth-aware hierarchy with lineage metadata', () => {
        const rootGoal = {
            id: 'mid',
            type: 'MidTermGoal',
            name: 'Mid',
            completed: false,
            children: [
                {
                    id: 'short',
                    type: 'ShortTermGoal',
                    name: 'Short',
                    completed: false,
                    children: [
                        {
                            id: 'immediate',
                            type: 'ImmediateGoal',
                            name: 'Immediate',
                            completed: true,
                            children: [],
                        },
                    ],
                },
            ],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [rootGoal],
            getGoalDetails: (id) => {
                const byId = {
                    mid: rootGoal,
                    short: rootGoal.children[0],
                    immediate: rootGoal.children[0].children[0],
                };
                return byId[id];
            },
        }));

        expect(result.current.map((node) => [node.name, node.depth])).toEqual([
            ['Mid', 0],
            ['Short', 1],
            ['Immediate', 2],
        ]);
        expect(result.current[2].lineage).toEqual([
            { type: 'MidTermGoal', completed: false },
            { type: 'ShortTermGoal', completed: false },
            { type: 'ImmediateGoal', completed: true },
        ]);
    });

    it('deduplicates repeated descendants across program seeds', () => {
        const sharedChild = {
            id: 'shared',
            type: 'ShortTermGoal',
            name: 'Shared',
            children: [],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [
                {
                    id: 'one',
                    type: 'MidTermGoal',
                    name: 'One',
                    children: [sharedChild],
                },
                {
                    id: 'shared',
                    type: 'ShortTermGoal',
                    name: 'Shared',
                    children: [],
                },
            ],
            getGoalDetails: (id) => {
                const byId = {
                    one: {
                        id: 'one',
                        type: 'MidTermGoal',
                        name: 'One',
                        children: [sharedChild],
                    },
                    shared: sharedChild,
                };
                return byId[id];
            },
        }));

        expect(result.current.map((node) => node.id)).toEqual(['one', 'shared']);
    });
});
