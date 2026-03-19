import { describe, expect, it } from 'vitest';
import {
    ACTIVE_GOAL_WINDOW_DAYS,
    deriveEvidenceGoalIds,
    isRecentCompletedActivityInstance,
} from '../useFlowTreeMetrics';

describe('useFlowTreeMetrics activity evidence helpers', () => {
    const now = new Date('2026-03-19T12:00:00Z');

    it('treats goals as active when a recent completed activity instance maps to them', () => {
        const evidenceGoalIds = deriveEvidenceGoalIds(
            [
                {
                    completed: false,
                    activity_instances: [
                        {
                            completed: true,
                            activity_definition_id: 'activity-1',
                            time_stop: '2026-03-18T09:30:00Z',
                        },
                    ],
                },
            ],
            [
                {
                    id: 'activity-1',
                    associated_goal_ids: ['goal-1'],
                },
            ],
            [],
            now,
        );

        expect(Array.from(evidenceGoalIds)).toEqual(['goal-1']);
    });

    it('does not fall back to session-level goals without a recent completed activity instance', () => {
        const evidenceGoalIds = deriveEvidenceGoalIds(
            [
                {
                    completed: true,
                    short_term_goals: [{ id: 'goal-session' }],
                    immediate_goals: [{ id: 'goal-immediate' }],
                    activity_instances: [],
                },
            ],
            [],
            [],
            now,
        );

        expect(Array.from(evidenceGoalIds)).toEqual([]);
    });

    it('includes group-mapped recent instances and excludes stale or invalid ones', () => {
        const evidenceGoalIds = deriveEvidenceGoalIds(
            [
                {
                    activity_instances: [
                        {
                            completed: true,
                            activity_definition_id: 'activity-grouped',
                            time_stop: '2026-03-13T08:00:00Z',
                        },
                        {
                            completed: true,
                            activity_definition_id: 'activity-grouped',
                            time_stop: '2026-03-11T07:59:59Z',
                        },
                        {
                            completed: true,
                            activity_definition_id: 'activity-grouped',
                            time_stop: 'not-a-date',
                        },
                    ],
                },
            ],
            [
                {
                    id: 'activity-grouped',
                    group_id: 'group-1',
                    associated_goal_ids: [],
                },
            ],
            [
                {
                    id: 'group-1',
                    associated_goal_ids: ['goal-from-group'],
                },
            ],
            now,
        );

        expect(Array.from(evidenceGoalIds)).toEqual(['goal-from-group']);
        expect(isRecentCompletedActivityInstance({
            completed: true,
            time_stop: `2026-03-${19 - ACTIVE_GOAL_WINDOW_DAYS}T12:00:00Z`,
        }, now)).toBe(true);
    });
});
