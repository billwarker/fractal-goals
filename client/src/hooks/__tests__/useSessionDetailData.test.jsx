import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionDetailData } from '../useSessionDetailData';

const {
    getSession,
    getSessionActivities,
    getActivities,
    getActivityGroups,
    getSessionGoalsView,
    useTargetAchievementsMock,
} = vi.hoisted(() => ({
    getSession: vi.fn(),
    getSessionActivities: vi.fn(),
    getActivities: vi.fn(),
    getActivityGroups: vi.fn(),
    getSessionGoalsView: vi.fn(),
    useTargetAchievementsMock: vi.fn(() => ({
        targetAchievements: new Map(),
        achievedTargetIds: new Set(),
        goalAchievements: new Map(),
    })),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSession: (...args) => getSession(...args),
        getSessionActivities: (...args) => getSessionActivities(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
        getSessionGoalsView: (...args) => getSessionGoalsView(...args),
    },
}));

vi.mock('../useTargetAchievements', () => ({
    useTargetAchievements: (...args) => useTargetAchievementsMock(...args),
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useSessionDetailData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useTargetAchievementsMock.mockImplementation(() => ({
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
            goalAchievements: new Map(),
        }));
    });

    it('hydrates session detail data under canonical query keys and normalizes section activity ids', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        getSession.mockResolvedValueOnce({
            data: {
                id: 'session-1',
                attributes: {
                    session_data: {
                        sections: [
                            {
                                name: 'Main',
                                exercises: [{ activity_id: 'activity-1' }],
                            },
                        ],
                    },
                },
                short_term_goals: [{ id: 'session-stale-goal' }],
                immediate_goals: [{ id: 'session-stale-immediate-goal' }],
            },
        });
        getSessionActivities.mockResolvedValueOnce({
            data: [{ id: 'instance-1', activity_definition_id: 'activity-1', duration_seconds: 45 }],
        });
        getActivities.mockResolvedValueOnce({
            data: [{ id: 'activity-1', name: 'Squat', group_id: 'group-1' }],
        });
        getActivityGroups.mockResolvedValueOnce({
            data: [{ id: 'group-1', name: 'Strength' }],
        });
        getSessionGoalsView.mockResolvedValueOnce({
            data: { session_goal_ids: [] },
        });

        const { result } = renderHook(
            () => useSessionDetailData({ rootId: 'root-1', sessionId: 'session-1', isDeletingSession: false }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.session?.id).toBe('session-1');
        });

        expect(queryClient.getQueryData(queryKeys.session('root-1', 'session-1'))).toMatchObject({ id: 'session-1' });
        expect(queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1'))).toEqual([
            { id: 'instance-1', activity_definition_id: 'activity-1', duration_seconds: 45 },
        ]);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Strength' },
        ]);
        expect(queryClient.getQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'))).toEqual({
            session_goal_ids: [],
        });
        expect(result.current.normalizedSessionData.sections[0].activity_ids).toEqual(['instance-1']);
        expect(result.current.groupedActivities['group-1']).toEqual([
            { id: 'activity-1', name: 'Squat', group_id: 'group-1' },
        ]);
    });

    it('returns safe empty values when session reads 404 during delete navigation', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        getSession.mockRejectedValueOnce({ response: { status: 404 } });
        getSessionActivities.mockRejectedValueOnce({ response: { status: 404 } });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });
        getSessionGoalsView.mockResolvedValueOnce({ data: null });

        const { result } = renderHook(
            () => useSessionDetailData({ rootId: 'root-1', sessionId: 'session-1', isDeletingSession: false }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.session).toBeNull();
        });

        expect(result.current.activityInstances).toEqual([]);
        expect(result.current.normalizedSessionData).toBeNull();
    });

    it('derives live target evaluation inputs from sessionGoalsView when available', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        getSession.mockResolvedValueOnce({
            data: {
                id: 'session-1',
                attributes: {
                    session_data: {
                        sections: [],
                    },
                },
                short_term_goals: [],
                immediate_goals: [],
            },
        });
        getSessionActivities.mockResolvedValueOnce({ data: [] });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });
        getSessionGoalsView.mockResolvedValueOnce({
            data: {
                goal_tree: {
                    id: 'root-goal',
                    children: [
                        {
                            id: 'immediate-goal',
                            attributes: {
                                targets: [{ id: 'target-1', activity_id: 'activity-1' }],
                            },
                            children: [],
                        },
                    ],
                },
            },
        });

        renderHook(
            () => useSessionDetailData({ rootId: 'root-1', sessionId: 'session-1', isDeletingSession: false }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            const [, goalsArg] = useTargetAchievementsMock.mock.lastCall || [];
            expect(goalsArg?.map((goal) => goal.id)).toEqual(['root-goal', 'immediate-goal']);
        });

        const [, goalsArg] = useTargetAchievementsMock.mock.lastCall;
        expect(goalsArg.map((goal) => goal.id)).toEqual(['root-goal', 'immediate-goal']);
    });
});
