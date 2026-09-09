import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionDetailMutations } from '../useSessionDetailMutations';

const {
    createGoal,
    updateGoal,
    addActivityToSession,
    startActivityTimer,
    updateActivityInstance,
    updateActivityMetrics,
    toggleGoalCompletion,
    pauseSession,
    resumeSession,
    notify,
} = vi.hoisted(() => ({
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    addActivityToSession: vi.fn(),
    startActivityTimer: vi.fn(),
    updateActivityInstance: vi.fn(),
    updateActivityMetrics: vi.fn(),
    toggleGoalCompletion: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createGoal: (...args) => createGoal(...args),
        updateGoal: (...args) => updateGoal(...args),
        addActivityToSession: (...args) => addActivityToSession(...args),
        startActivityTimer: (...args) => startActivityTimer(...args),
        updateActivityInstance: (...args) => updateActivityInstance(...args),
        updateActivityMetrics: (...args) => updateActivityMetrics(...args),
        toggleGoalCompletion: (...args) => toggleGoalCompletion(...args),
        pauseSession: (...args) => pauseSession(...args),
        resumeSession: (...args) => resumeSession(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
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

function createBaseOptions(queryClient, overrides = {}) {
    return {
        rootId: 'root-1',
        sessionId: 'session-1',
        session: {
            id: 'session-1',
            attributes: { completed: false },
        },
        activityInstances: [{ id: 'inst-1', duration_seconds: 30, activity_definition_id: 'act-1' }],
        activities: [{ id: 'act-1', name: 'Activity 1' }],
        queryClient,
        sessionKey: queryKeys.session('root-1', 'session-1'),
        sessionActivitiesKey: queryKeys.sessionActivities('root-1', 'session-1'),
        sessionGoalsViewKey: queryKeys.sessionGoalsView('root-1', 'session-1'),
        sessionNotesKey: queryKeys.sessionNotes('root-1', 'session-1'),
        sessionsKey: queryKeys.sessions('root-1'),
        sessionsAllKey: queryKeys.sessionsAll('root-1'),
        sessionsPaginatedKey: queryKeys.sessionsPaginated('root-1'),
        fractalTreeKey: queryKeys.fractalTree('root-1'),
        activitiesKey: queryKeys.activities('root-1'),
        updateSession: vi.fn(),
        updateSessionDataDraft: vi.fn(),
        setSessionDataDraft: vi.fn(),
        setShowActivitySelector: vi.fn(),
        setIsDeletingSession: vi.fn(),
        instanceQueuesRef: { current: new Map() },
        instanceRollbackRef: { current: new Map() },
        ...overrides,
    };
}


describe("useSessionDetailMutations — goalAndMetricCaches", () => {
beforeEach(() => {
        vi.clearAllMocks();
    });
it('copies exact set and metric values from a previous activity instance into the target instance', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            {
                id: 'source-inst',
                activity_definition_id: 'act-1',
                sets: [
                    {
                        instance_id: 'source-set-1',
                        completed: true,
                        metrics: [{ metric_id: 'metric-1', value: 8 }],
                    },
                    {
                        instance_id: 'source-set-2',
                        completed: false,
                        metrics: [{ metric_id: 'metric-1', split_id: 'left', value: 5 }],
                    },
                ],
                metrics: [],
            },
            {
                id: 'target-inst',
                activity_definition_id: 'act-1',
                sets: [
                    {
                        instance_id: 'target-set-1',
                        completed: false,
                        metrics: [{ metric_id: 'metric-1', value: 1 }],
                    },
                ],
                metrics: [{ metric_id: 'metric-1', value: 2 }],
            },
        ]);

        updateActivityInstance.mockResolvedValueOnce({
            data: { id: 'target-inst', activity_definition_id: 'act-1', sets: [] }
        });
        updateActivityMetrics.mockResolvedValueOnce({
            data: { id: 'target-inst', activity_definition_id: 'act-1', metrics: [] }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient, {
                activityInstances: queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1')),
            })),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.copyActivityValuesFromInstance('target-inst', 'source-inst');
        });

        expect(updateActivityInstance).toHaveBeenCalledWith('root-1', 'target-inst', expect.objectContaining({
            session_id: 'session-1',
            activity_definition_id: 'act-1',
            sets: [
                expect.objectContaining({
                    completed: true,
                    metrics: [{ metric_id: 'metric-1', split_id: null, value: 8 }],
                }),
                expect.objectContaining({
                    completed: false,
                    metrics: [{ metric_id: 'metric-1', split_id: 'left', value: 5 }],
                }),
            ],
        }));
        expect(updateActivityMetrics).toHaveBeenCalledWith('root-1', 'session-1', 'target-inst', { metrics: [] });
        expect(notify.success).toHaveBeenCalledWith('Copied values from previous instance');
    });

it('rejects copying values between different activity definitions', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            { id: 'target-inst', activity_definition_id: 'act-1', sets: [], metrics: [] },
            { id: 'source-inst', activity_definition_id: 'act-2', sets: [], metrics: [{ metric_id: 'metric-1', value: 8 }] },
        ]);

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient, {
                activityInstances: queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1')),
            })),
            { wrapper: createWrapper(queryClient) }
        );

        let copied;
        await act(async () => {
            copied = await result.current.copyActivityValuesFromInstance('target-inst', 'source-inst');
        });

        expect(copied).toBeNull();
        expect(updateActivityInstance).not.toHaveBeenCalled();
        expect(updateActivityMetrics).not.toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledWith('Previous values can only be copied from the same activity');
    });

it('updates goal caches immediately after editing a goal from session detail', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const originalGoal = {
            id: 'goal-1',
            name: 'Goal 1',
            description: '',
            attributes: { id: 'goal-1', type: 'ImmediateGoal', description: '' },
            children: [],
        };
        const updatedGoal = {
            ...originalGoal,
            description: 'New description',
            attributes: {
                ...originalGoal.attributes,
                description: 'New description',
                updated_at: '2026-06-09T16:00:00Z',
            },
        };
        queryClient.setQueryData(queryKeys.fractalTree('root-1'), {
            id: 'root-1',
            children: [originalGoal],
        });
        queryClient.setQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'), {
            goal_tree: {
                id: 'root-1',
                children: [originalGoal],
            },
        });
        queryClient.setQueryData(queryKeys.goals('root-1'), [originalGoal]);
        queryClient.setQueryData(queryKeys.goalsForSelection('root-1'), [originalGoal]);
        updateGoal.mockResolvedValueOnce({ data: updatedGoal });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        let response;
        await act(async () => {
            response = await result.current.updateGoal({
                goalId: 'goal-1',
                updates: { description: 'New description' },
            });
        });

        expect(response.data).toEqual(updatedGoal);
        expect(updateGoal).toHaveBeenCalledWith('root-1', 'goal-1', { description: 'New description' });
        expect(queryClient.getQueryData(queryKeys.goals('root-1'))[0].description).toBe('New description');
        expect(queryClient.getQueryData(queryKeys.goalsForSelection('root-1'))[0].description).toBe('New description');
        expect(queryClient.getQueryData(queryKeys.fractalTree('root-1')).children[0].description).toBe('New description');
        expect(queryClient.getQueryData(queryKeys.sessionGoalsView('root-1', 'session-1')).goal_tree.children[0].description).toBe('New description');
    });

it('refetches the canonical session goals view when adding an associated activity', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), []);
        queryClient.setQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'), {
            goal_tree: {
                id: 'root-goal',
                name: 'Root',
                children: [{ id: 'goal-1', name: 'Goal 1', children: [] }],
            },
            session_activity_ids: [],
            session_goal_ids: [],
            activity_goal_ids_by_activity: {},
        });

        let draftState = {
            sections: [{ activity_ids: [] }]
        };

        const options = createBaseOptions(queryClient, {
            activities: [{ id: 'act-2', name: 'Activity 2', associated_goal_ids: ['goal-1'] }],
            activityInstances: [],
            updateSessionDataDraft: vi.fn((updater) => {
                draftState = typeof updater === 'function' ? updater(draftState) : updater;
            }),
        });
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        addActivityToSession.mockResolvedValueOnce({
            data: { id: 'inst-2', activity_definition_id: 'act-2' }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(options),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.addActivity(0, 'act-2');
        });

        expect(draftState.sections[0].items).toEqual([
            { type: 'activity', activity_instance_id: 'inst-2' },
        ]);
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionGoalsView('root-1', 'session-1'),
        });
    });

it('invalidates progress history and session summary after activity metric-like updates', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            { id: 'inst-1', activity_definition_id: 'act-1' },
        ]);
        updateActivityInstance.mockResolvedValueOnce({
            data: {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                progress_comparison: {
                    activity_instance_id: 'inst-1',
                    metric_comparisons: [],
                },
            },
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.updateInstance('inst-1', {
                sets: [{ metrics: [{ metric_id: 'm1', value: 110 }] }],
            });
        });

        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.progressComparison('inst-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.progressHistoryRoot('act-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionProgressSummary('session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessions('root-1') });
    });
});
