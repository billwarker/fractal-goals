import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionGoalsViewModel } from '../useSessionGoalsViewModel';

describe('useSessionGoalsViewModel activity scope filtering', () => {
    it('derives manual and completed evidence lineages independently', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root', name: 'Root', type: 'UltimateGoal', children: [
                    { id: 'manual', name: 'Manual', type: 'LongTermGoal', children: [] },
                    { id: 'evidence', name: 'Evidence', type: 'LongTermGoal', children: [] },
                ],
            },
            manual_goal_ids: ['manual'],
            automatic_goal_ids: ['evidence'],
            session_goal_ids: ['manual'],
            session_activity_ids: ['activity-1'],
            activity_goal_ids_by_activity: { 'activity-1': ['evidence'] },
        };
        const { result } = renderHook(() => useSessionGoalsViewModel({
            sessionGoalsView,
            activityInstances: [{ id: 'instance-1', activity_definition_id: 'activity-1', completed: true }],
            localSessionData: { sections: [{ activity_ids: ['instance-1'] }] },
            selectedActivity: null,
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
        }));

        expect(result.current.manualGoalIds).toEqual(new Set(['manual']));
        expect(result.current.evidenceGoalIds).toEqual(new Set(['evidence', 'root']));
        expect(result.current.completedEvidenceGoalIds).toEqual(new Set(['evidence', 'root']));
        expect(result.current.sessionHierarchy.map((goal) => goal.id)).toEqual(['root', 'manual', 'evidence']);
    });
    it('excludes paused goals from the activity hierarchy', () => {
        const sessionGoalsView = {
            goal_tree: {
                id: 'root',
                type: 'UltimateGoal',
                name: 'Root',
                children: [
                    {
                        id: 'paused',
                        type: 'ImmediateGoal',
                        name: 'Paused Activity Goal',
                        paused: true,
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
        expect(names).not.toContain('Paused Activity Goal');
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
