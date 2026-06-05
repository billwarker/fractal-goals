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
        const sessionGoals = [
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

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals));
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
        const sessionGoals = [
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

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals));
        expect(result.current.targetAchievements.get('target-gt')?.achieved).toBe(true);
        expect(result.current.targetAchievements.get('target-lt')?.achieved).toBe(false);
    });

    it('reverts a persisted session target when the current activity instance is reset', () => {
        const activityInstances = [
            {
                id: 'inst-3',
                activity_definition_id: 'activity-3',
                completed: false,
                metrics: [{ metric_id: 'm-1', value: 10 }]
            }
        ];
        const sessionGoals = [
            {
                id: 'micro-3',
                completed: false,
                attributes: {
                    targets: [
                        {
                            id: 'target-3',
                            type: 'threshold',
                            activity_id: 'activity-3',
                            activity_instance_id: 'inst-3',
                            completed: true,
                            completed_session_id: 'session-1',
                            metrics: [{ metric_id: 'm-1', value: 10 }]
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals, 'session-1'));
        expect(result.current.achievedTargetIds.has('target-3')).toBe(false);
        expect(result.current.targetAchievements.get('target-3')?.achieved).toBe(false);
    });

    it('keeps a persisted target achieved when a later instance performs worse', () => {
        const activityInstances = [
            {
                id: 'inst-4-later',
                activity_definition_id: 'activity-4',
                completed: true,
                metrics: [{ metric_id: 'm-1', value: 5 }]
            }
        ];
        const sessionGoals = [
            {
                id: 'micro-4',
                completed: true,
                attributes: {
                    targets: [
                        {
                            id: 'target-4',
                            type: 'threshold',
                            activity_id: 'activity-4',
                            completed: true,
                            completed_session_id: 'session-prior',
                            completed_instance_id: 'inst-4-prior',
                            metrics: [{ metric_id: 'm-1', value: 10 }]
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals, 'session-current'));
        expect(result.current.achievedTargetIds.has('target-4')).toBe(true);
        expect(result.current.targetAchievements.get('target-4')?.achieved).toBe(true);
        expect(result.current.targetAchievements.get('target-4')?.wasAlreadyCompleted).toBe(true);
    });

    it('keeps a target achieved within the same session when a later instance performs worse', () => {
        const activityInstances = [
            {
                id: 'inst-6-later',
                activity_definition_id: 'activity-6',
                completed: true,
                metrics: [{ metric_id: 'm-1', value: 5 }]
            }
        ];
        const sessionGoals = [
            {
                id: 'micro-6',
                completed: true,
                attributes: {
                    targets: [
                        {
                            id: 'target-6',
                            type: 'threshold',
                            activity_id: 'activity-6',
                            completed: true,
                            completed_session_id: 'session-current',
                            completed_instance_id: 'inst-6-prior',
                            metrics: [{ metric_id: 'm-1', value: 10 }]
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals, 'session-current'));
        expect(result.current.achievedTargetIds.has('target-6')).toBe(true);
        expect(result.current.targetAchievements.get('target-6')?.achieved).toBe(true);
        expect(result.current.targetAchievements.get('target-6')?.wasAlreadyCompleted).toBe(true);
    });

    it('keeps a persisted target achieved when a later instance has no metric', () => {
        const activityInstances = [
            {
                id: 'inst-5-later',
                activity_definition_id: 'activity-5',
                completed: true,
                metrics: []
            }
        ];
        const sessionGoals = [
            {
                id: 'micro-5',
                completed: true,
                attributes: {
                    targets: [
                        {
                            id: 'target-5',
                            type: 'threshold',
                            activity_id: 'activity-5',
                            completed: true,
                            completed_session_id: 'session-prior',
                            completed_instance_id: 'inst-5-prior',
                            metrics: [{ metric_id: 'm-1', value: 10 }]
                        }
                    ]
                }
            }
        ];

        const { result } = renderHook(() => useTargetAchievements(activityInstances, sessionGoals, 'session-current'));
        expect(result.current.achievedTargetIds.has('target-5')).toBe(true);
        expect(result.current.targetAchievements.get('target-5')?.achieved).toBe(true);
        expect(result.current.targetAchievements.get('target-5')?.wasAlreadyCompleted).toBe(true);
    });
});
