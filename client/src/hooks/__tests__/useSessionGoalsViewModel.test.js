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
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const names = result.current.activityHierarchy.map((node) => node.name);
        expect(names).toContain('IG A');
        expect(names).not.toContain('IG B');
        expect(names).not.toContain('STG B');
    });
});
