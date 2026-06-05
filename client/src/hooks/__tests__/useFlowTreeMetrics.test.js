import { describe, expect, it } from 'vitest';
import {
    ACTIVE_GOAL_WINDOW_DAYS,
    deriveEvidenceGoalIds,
    getActiveLineageIds,
    isRecentCompletedActivityInstance,
    normalizeActiveGoalWindowDays,
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
                    session_goals: [{ id: 'goal-session' }, { id: 'goal-immediate' }],
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

    it('builds active lineage until a paused ancestor is reached', () => {
        const parentById = new Map([
            ['child', 'paused-parent'],
            ['paused-parent', 'root'],
        ]);
        const nodeById = new Map([
            ['child', { id: 'child' }],
            ['paused-parent', { id: 'paused-parent', frozen: true }],
            ['root', { id: 'root' }],
        ]);

        expect(Array.from(getActiveLineageIds(new Set(['child']), parentById, nodeById))).toEqual(['child']);
        expect(Array.from(getActiveLineageIds(new Set(['paused-parent']), parentById, nodeById))).toEqual([]);
    });

    it('normalizes active goal window days to the supported range', () => {
        expect(normalizeActiveGoalWindowDays(undefined)).toBe(7);
        expect(normalizeActiveGoalWindowDays(0)).toBe(1);
        expect(normalizeActiveGoalWindowDays(365)).toBe(90);
        expect(normalizeActiveGoalWindowDays('14')).toBe(14);
    });
});
