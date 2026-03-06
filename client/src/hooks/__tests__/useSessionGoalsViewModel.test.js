import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionGoalsViewModel } from '../useSessionGoalsViewModel';

describe('useSessionGoalsViewModel', () => {
    it('preserves ancestor lineage in activity hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'stg',
                        type: 'ShortTermGoal',
                        name: 'STG',
                        children: [
                            {
                                id: 'ig',
                                type: 'ImmediateGoal',
                                name: 'IG',
                                children: []
                            }
                        ]
                    }
                ]
            },
            session_goal_ids: ['ig', 'micro'],
            activity_goal_ids_by_activity: {
                'activity-1': ['ig']
            },
            micro_goals: [
                {
                    id: 'micro',
                    type: 'MicroGoal',
                    name: 'Micro',
                    parent_id: 'ig',
                    activity_definition_id: 'activity-1',
                    children: [
                        { id: 'nano', type: 'NanoGoal', name: 'Nano', parent_id: 'micro', children: [] }
                    ]
                }
            ],
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.activityHierarchy.map((node) => node.name)).toEqual(['Root', 'STG', 'IG', 'Micro', 'Nano']);
    });

    it('marks target cards complete when owning goal is completed via computed status', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: []
            },
            session_goal_ids: ['micro'],
            activity_goal_ids_by_activity: {},
            micro_goals: [
                {
                    id: 'micro',
                    type: 'MicroGoal',
                    name: 'Micro',
                    parent_id: 'root',
                    completed: false,
                    attributes: {
                        targets: [
                            {
                                id: 'target-1',
                                activity_id: 'activity-1',
                                type: 'threshold',
                                metrics: [{ metric_id: 'm1', value: 10 }]
                            }
                        ]
                    },
                    children: []
                }
            ],
            session_activity_ids: ['activity-1']
        };

        const targetAchievements = new Map([
            ['target-1', { achieved: true }]
        ]);

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: null,
            targetAchievements,
            achievedTargetIds: new Set(['target-1']),
        }));

        expect(result.current.goalStatusById.get('micro')?.completed).toBe(true);
        expect(result.current.targetCards[0]?.is_completed_realtime).toBe(true);
        expect(result.current.targetCards[0]?.completion_reason).toBe('realtime_target');
    });

    it('scopes instance-bound micro goals to the focused activity instance', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'stg',
                        type: 'ShortTermGoal',
                        name: 'STG',
                        children: [
                            {
                                id: 'ig',
                                type: 'ImmediateGoal',
                                name: 'IG',
                                children: []
                            }
                        ]
                    }
                ]
            },
            session_goal_ids: ['ig', 'micro-a', 'micro-b'],
            activity_goal_ids_by_activity: {
                'activity-1': ['ig']
            },
            micro_goals: [
                {
                    id: 'micro-a',
                    type: 'MicroGoal',
                    name: 'Micro A',
                    parent_id: 'ig',
                    activity_definition_id: 'activity-1',
                    attributes: {
                        targets: [
                            {
                                id: 'target-a',
                                activity_id: 'activity-1',
                                activity_instance_id: 'inst-a',
                                type: 'threshold',
                                metrics: [{ metric_id: 'm1', value: 10 }]
                            }
                        ]
                    },
                    children: []
                },
                {
                    id: 'micro-b',
                    type: 'MicroGoal',
                    name: 'Micro B',
                    parent_id: 'ig',
                    activity_definition_id: 'activity-1',
                    attributes: {
                        targets: [
                            {
                                id: 'target-b',
                                activity_id: 'activity-1',
                                activity_instance_id: 'inst-b',
                                type: 'threshold',
                                metrics: [{ metric_id: 'm1', value: 10 }]
                            }
                        ]
                    },
                    children: []
                }
            ],
            session_activity_ids: ['activity-1']
        };

        const { result: focusedA } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: { id: 'inst-a', activity_definition_id: 'activity-1' },
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const { result: focusedB } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: { id: 'inst-b', activity_definition_id: 'activity-1' },
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(focusedA.current.activityHierarchy.map((node) => node.name)).toContain('Micro A');
        expect(focusedA.current.activityHierarchy.map((node) => node.name)).not.toContain('Micro B');
        expect(focusedB.current.activityHierarchy.map((node) => node.name)).toContain('Micro B');
        expect(focusedB.current.activityHierarchy.map((node) => node.name)).not.toContain('Micro A');
    });

    it('does not leak session-wide structural goals into activity view for unrelated activity focus', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'stg-a',
                        type: 'ShortTermGoal',
                        name: 'STG A',
                        children: [{ id: 'ig-a', type: 'ImmediateGoal', name: 'IG A', children: [] }]
                    },
                    {
                        id: 'stg-b',
                        type: 'ShortTermGoal',
                        name: 'STG B',
                        children: [{ id: 'ig-b', type: 'ImmediateGoal', name: 'IG B', children: [] }]
                    }
                ]
            },
            session_goal_ids: ['ig-a', 'ig-b'],
            activity_goal_ids_by_activity: {
                'activity-1': ['ig-a'],
                'activity-2': ['ig-b']
            },
            micro_goals: [],
            session_activity_ids: ['activity-1', 'activity-2']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.activityHierarchy.map((node) => node.name);
        expect(names).toContain('IG A');
        expect(names).not.toContain('IG B');
        expect(names).not.toContain('STG B');
    });

    it('reverts target card and micro goal completion when target achievement is lost', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: []
            },
            session_goal_ids: ['micro'],
            activity_goal_ids_by_activity: {},
            micro_goals: [
                {
                    id: 'micro',
                    type: 'MicroGoal',
                    name: 'Micro',
                    parent_id: 'root',
                    completed: true,
                    attributes: {
                        completed: true,
                        targets: [
                            {
                                id: 'target-1',
                                activity_id: 'activity-1',
                                completed: true,
                                completed_session_id: 'session-1',
                                type: 'threshold',
                                metrics: [{ metric_id: 'm1', value: 10 }]
                            }
                        ]
                    },
                    children: []
                }
            ],
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: null,
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.goalStatusById.get('micro')?.completed).toBe(false);
        expect(result.current.targetCards[0]?.is_completed_realtime).toBe(false);
    });

    it('includes instance-bound micro targets in session view target cards', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'ig',
                        type: 'ImmediateGoal',
                        name: 'Immediate',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['ig', 'micro'],
            activity_goal_ids_by_activity: {
                'activity-1': ['ig']
            },
            micro_goals: [
                {
                    id: 'micro',
                    type: 'MicroGoal',
                    name: 'Micro',
                    parent_id: 'ig',
                    activity_definition_id: 'activity-1',
                    attributes: {
                        targets: [
                            {
                                id: 'target-1',
                                activity_id: 'activity-1',
                                activity_instance_id: 'inst-1',
                                type: 'threshold',
                                metrics: [{ metric_id: 'm1', value: 10 }]
                            }
                        ]
                    },
                    children: []
                }
            ],
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            session: { session_start: '2026-03-06T08:00:00Z', created_at: '2026-03-06T08:00:00Z', completed: false },
            selectedActivity: null,
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.sessionHierarchy.map((node) => node.name)).toContain('Micro');
        expect(result.current.targetCards.map((target) => target.id)).toContain('target-1');
        expect(result.current.targetCards[0]?.metrics?.[0]?.value).toBe(10);
    });
});
