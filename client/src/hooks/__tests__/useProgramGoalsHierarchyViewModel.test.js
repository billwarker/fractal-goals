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

    it('hides completed goals outside the program dates and completed goals without dates', () => {
        const seed = {
            id: 'program-seed',
            type: 'MidTermGoal',
            name: 'Seed',
            completed: false,
            children: [
                {
                    id: 'before',
                    type: 'ShortTermGoal',
                    name: 'Before',
                    completed: true,
                    completed_at: '2026-05-01T12:00:00Z',
                    children: [],
                },
                {
                    id: 'inside',
                    type: 'ShortTermGoal',
                    name: 'Inside',
                    completed: true,
                    completed_at: '2026-06-01T12:00:00Z',
                    children: [],
                },
                {
                    id: 'after',
                    type: 'ShortTermGoal',
                    name: 'After',
                    completed: true,
                    completed_at: '2026-09-01T12:00:00Z',
                    children: [],
                },
            ],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [seed],
            startDate: '2026-05-22',
            endDate: '2026-08-31',
        }));

        expect(result.current.map((node) => node.id)).toEqual([
            'program-seed',
            'inside',
        ]);
    });

    it('continues walking descendants when a completed parent is hidden', () => {
        const hiddenParent = {
            id: 'hidden-parent',
            type: 'MidTermGoal',
            name: 'Hidden Parent',
            completed: true,
            completed_at: '2026-05-01T12:00:00Z',
            children: [
                {
                    id: 'visible-child',
                    type: 'ShortTermGoal',
                    name: 'Visible Child',
                    completed: false,
                    children: [],
                },
            ],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [hiddenParent],
            startDate: '2026-05-22',
            endDate: '2026-08-31',
        }));

        expect(result.current.map((node) => [node.id, node.depth, node.lineage])).toEqual([
            ['visible-child', 0, [{ type: 'ShortTermGoal', completed: false }]],
        ]);
    });

    it('recognizes nested status completion metadata when filtering by program dates', () => {
        const seed = {
            id: 'seed',
            type: 'MidTermGoal',
            name: 'Seed',
            children: [
                {
                    id: 'outside-status',
                    type: 'ShortTermGoal',
                    name: 'Outside Status',
                    status: {
                        completed: true,
                        completedAt: '2026-05-10T12:00:00Z',
                    },
                    children: [],
                },
                {
                    id: 'inside-attributes-status',
                    type: 'ShortTermGoal',
                    name: 'Inside Attributes Status',
                    attributes: {
                        completed: true,
                        completedAt: '2026-05-24T12:00:00Z',
                    },
                    children: [],
                },
            ],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [seed],
            startDate: '2026-05-22T00:00:00Z',
            endDate: '2026-05-26T00:00:00Z',
        }));

        expect(result.current.map((node) => node.id)).toEqual(['seed', 'inside-attributes-status']);
    });

    it('treats goals with all completed targets as completed for program date filtering', () => {
        const seed = {
            id: 'seed',
            type: 'MidTermGoal',
            name: 'Seed',
            children: [
                {
                    id: 'target-before',
                    type: 'ShortTermGoal',
                    name: 'Target Before',
                    targets: [
                        {
                            id: 'target-1',
                            completed: true,
                            completed_at: '2026-05-10T12:00:00Z',
                        },
                    ],
                    children: [],
                },
                {
                    id: 'target-inside',
                    type: 'ShortTermGoal',
                    name: 'Target Inside',
                    attributes: {
                        targets: [
                            {
                                id: 'target-2',
                                completed: true,
                                completed_at: '2026-05-24T12:00:00Z',
                            },
                        ],
                    },
                    children: [],
                },
                {
                    id: 'target-pending',
                    type: 'ShortTermGoal',
                    name: 'Target Pending',
                    targets: [
                        {
                            id: 'target-3',
                            completed: false,
                        },
                    ],
                    children: [],
                },
            ],
        };

        const { result } = renderHook(() => useProgramGoalsHierarchyViewModel({
            goalSeeds: [seed],
            startDate: '2026-05-22',
            endDate: '2026-05-26',
        }));

        expect(result.current.map((node) => node.id)).toEqual([
            'seed',
            'target-inside',
            'target-pending',
        ]);
    });
});
