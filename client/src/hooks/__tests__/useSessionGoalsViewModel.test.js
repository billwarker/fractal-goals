import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionGoalsViewModel } from '../useSessionGoalsViewModel';

describe('useSessionGoalsViewModel', () => {
    it('includes ancestors of associated goals in the activity hierarchy', () => {
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
            session_goal_ids: ['ig'],
            activity_goal_ids_by_activity: {
                'activity-1': ['ig']
            },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.activityHierarchy.map((node) => node.name)).toEqual(['Root', 'STG', 'IG']);
    });

    it('does not pull structural descendants into activity hierarchy when only an ancestor goal is associated', () => {
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
            session_goal_ids: ['stg', 'ig'],
            activity_goal_ids_by_activity: {
                'activity-1': ['stg']
            },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.activityHierarchy.map((node) => node.name)).toEqual(['Root', 'STG']);
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
            session_activity_ids: ['activity-1', 'activity-2']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.activityHierarchy.map((node) => node.name);
        expect(names).toContain('IG A');
        expect(names).not.toContain('IG B');
        expect(names).not.toContain('STG B');
    });

    it('excludes goals completed before the session start from the session hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'old',
                        type: 'ImmediateGoal',
                        name: 'Already Done',
                        completed: true,
                        completed_at: '2026-05-01T12:00:00Z',
                        children: []
                    },
                    {
                        id: 'during',
                        type: 'ImmediateGoal',
                        name: 'Done During Session',
                        completed: true,
                        completed_at: '2026-05-03T12:30:00Z',
                        children: []
                    },
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active',
                        completed: false,
                        children: []
                    }
                ]
            },
            session_goal_ids: ['old', 'during', 'active'],
            activity_goal_ids_by_activity: { 'activity-1': ['old', 'during', 'active'] },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            session: { session_start: '2026-05-03T12:00:00Z' },
            sessionGoalsView,
            selectedActivity: null,
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.sessionHierarchy.map((node) => node.name);
        expect(names).not.toContain('Already Done');
        expect(names).toContain('Done During Session');
        expect(names).toContain('Active');
    });

    it('keeps completed ancestors when active session goals need their lineage', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Completed Root',
                completed: true,
                completed_at: '2026-05-01T12:00:00Z',
                children: [
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active Leaf',
                        completed: false,
                        children: []
                    }
                ]
            },
            session_goal_ids: ['active'],
            activity_goal_ids_by_activity: { 'activity-1': ['active'] },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            session: { session_start: '2026-05-03T12:00:00Z' },
            sessionGoalsView,
            selectedActivity: null,
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.sessionHierarchy.map((node) => node.name)).toEqual([
            'Completed Root',
            'Active Leaf',
        ]);
    });

    it('returns an empty session hierarchy when the current session has no activities', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active Leaf',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['active'],
            activity_goal_ids_by_activity: { 'activity-1': ['active'] },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: null,
            activityInstances: [],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.sessionHierarchy).toEqual([]);
        expect(result.current.sessionActivityIds.size).toBe(0);
    });

    it('uses section activity ids to exclude instances no longer shown in the session', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active Leaf',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['active'],
            activity_goal_ids_by_activity: { 'activity-1': ['active'] },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: null,
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            localSessionData: { sections: [{ activity_ids: [] }] },
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.sessionHierarchy).toEqual([]);
    });

    it('excludes goals completed before the session start from the activity hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'old',
                        type: 'ImmediateGoal',
                        name: 'Old Activity Goal',
                        completed: true,
                        completed_at: '2026-05-01T12:00:00Z',
                        children: []
                    },
                    {
                        id: 'current',
                        type: 'ImmediateGoal',
                        name: 'Current Activity Goal',
                        completed: false,
                        children: []
                    }
                ]
            },
            session_goal_ids: ['old', 'current'],
            activity_goal_ids_by_activity: {
                'activity-1': ['old', 'current']
            },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            session: { attributes: { session_start: '2026-05-03T12:00:00Z' } },
            sessionGoalsView,
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.activityHierarchy.map((node) => node.name);
        expect(names).not.toContain('Old Activity Goal');
        expect(names).toContain('Current Activity Goal');
    });

    it('excludes paused goals from the session hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'paused',
                        type: 'ImmediateGoal',
                        name: 'Paused Goal',
                        paused: true,
                        children: []
                    },
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active Goal',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['paused', 'active'],
            activity_goal_ids_by_activity: { 'activity-1': ['paused', 'active'] },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: null,
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.sessionHierarchy.map((node) => node.name);
        expect(names).not.toContain('Paused Goal');
        expect(names).toContain('Active Goal');
    });

    it('excludes frozen goals from the activity hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'paused',
                        type: 'ImmediateGoal',
                        name: 'Frozen Activity Goal',
                        frozen: true,
                        children: []
                    },
                    {
                        id: 'active',
                        type: 'ImmediateGoal',
                        name: 'Active Activity Goal',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['paused', 'active'],
            activity_goal_ids_by_activity: {
                'activity-1': ['paused', 'active']
            },
            session_activity_ids: ['activity-1']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: { id: 'inst-1', activity_definition_id: 'activity-1' },
            activityInstances: [{ id: 'inst-1', activity_definition_id: 'activity-1' }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.activityHierarchy.map((node) => node.name);
        expect(names).not.toContain('Frozen Activity Goal');
        expect(names).toContain('Active Activity Goal');
    });
});
