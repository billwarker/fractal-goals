import { it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionGoalsViewModel } from '../useSessionGoalsViewModel';

it('highlights one-off instance goals without widening the definition map', () => {
    const instance = { id: 'one', activity_definition_id: 'activity', completed: true, associated_goal_ids: ['child'] };
    const sibling = { ...instance, id: 'sibling', associated_goal_ids: [] };
    const options = {
        sessionGoalsView: {
            goal_tree: { id: 'root', name: 'Root', type: 'UltimateGoal', children: [{ id: 'child', name: 'One-off', type: 'LongTermGoal', children: [] }] },
            manual_goal_ids: [], automatic_goal_ids: ['child'], session_activity_ids: ['activity'], activity_goal_ids_by_activity: {},
        },
        selectedActivity: instance, activityInstances: [instance, sibling], targetAchievements: new Map(), achievedTargetIds: new Set(),
    };
    const { result, rerender } = renderHook((props) => useSessionGoalsViewModel(props), { initialProps: options });
    expect([...result.current.selectedActivityGoalIds]).toEqual(['child']);
    expect(result.current.activityHierarchy.map((goal) => goal.id)).toEqual(['root', 'child']);
    expect([...result.current.completedEvidenceGoalIds]).toContain('child');
    rerender({ ...options, selectedActivity: sibling });
    expect([...result.current.selectedActivityGoalIds]).toEqual([]);
    expect(result.current.activityHierarchy).toEqual([]);
});
