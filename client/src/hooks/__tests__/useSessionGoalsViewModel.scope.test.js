import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionGoalsViewModel } from '../useSessionGoalsViewModel';

describe('useSessionGoalsViewModel activity scope filtering', () => {
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

    it('trusts the canonical session goals view map for activity scope', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'handstand',
                        type: 'ImmediateGoal',
                        name: 'Handstand Goal',
                        children: []
                    },
                    {
                        id: 'muscle-up',
                        type: 'ImmediateGoal',
                        name: 'Muscle Up Goal',
                        children: []
                    }
                ]
            },
            session_goal_ids: ['handstand'],
            activity_goal_ids_by_activity: {
                'handstand-activity': ['handstand'],
                'muscle-up-activity': ['muscle-up'],
            },
            session_activity_ids: ['handstand-activity', 'muscle-up-activity']
        };

        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            selectedActivity: { id: 'inst-2', activity_definition_id: 'muscle-up-activity' },
            activityInstances: [
                { id: 'inst-1', activity_definition_id: 'handstand-activity' },
                { id: 'inst-2', activity_definition_id: 'muscle-up-activity' },
            ],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        const sessionNames = result.current.sessionHierarchy.map((node) => node.name);
        const activityNames = result.current.activityHierarchy.map((node) => node.name);

        expect(sessionNames).toContain('Handstand Goal');
        expect(sessionNames).toContain('Muscle Up Goal');
        expect(activityNames).toContain('Muscle Up Goal');
        expect(result.current.selectedActivityGoalIds).toEqual(new Set(['muscle-up']));
    });
});
