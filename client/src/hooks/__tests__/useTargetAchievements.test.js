import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTargetAchievements } from '../useTargetAchievements';

describe('useTargetAchievements', () => {
    it('marks completion targets achieved when matching instance is completed', () => {
        const activityInstances = [
            {
                id: 'inst-1',
                activity_definition_id: 'activity-1',
                completed: true,
                metrics: []
            }
        ];
        const parentGoals = [
            {
                id: 'micro-1',
                completed: false,
                attributes: {
                    targets: [
                        {
                            id: 'target-1',
                            type: 'completion',
                            activity_id: 'activity-1',
                            activity_instance_id: 'inst-1',
                            metrics: []
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, parentGoals));
        expect(result.current.achievedTargetIds.has('target-1')).toBe(true);
        expect(result.current.targetAchievements.get('target-1')?.achieved).toBe(true);
    });

    it('evaluates metric operators correctly', () => {
        const activityInstances = [
            {
                id: 'inst-2',
                activity_definition_id: 'activity-2',
                completed: true,
                metrics: [{ metric_id: 'm-1', value: 10 }]
            }
        ];
        const parentGoals = [
            {
                id: 'micro-2',
                completed: false,
                attributes: {
                    targets: [
                        {
                            id: 'target-gt',
                            type: 'threshold',
                            activity_id: 'activity-2',
                            metrics: [{ metric_id: 'm-1', operator: '>', value: 5 }]
                        },
                        {
                            id: 'target-lt',
                            type: 'threshold',
                            activity_id: 'activity-2',
                            metrics: [{ metric_id: 'm-1', operator: '<', value: 5 }]
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, parentGoals));
        expect(result.current.targetAchievements.get('target-gt')?.achieved).toBe(true);
        expect(result.current.targetAchievements.get('target-lt')?.achieved).toBe(false);
    });
});
