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


describe("useSessionDetailMutations — timerActions", () => {
beforeEach(() => {
        vi.clearAllMocks();
    });
it('omits blank metric placeholders when adding an activity set', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            { id: 'inst-1', activity_definition_id: 'act-1', sets: [] },
        ]);
        updateActivityInstance.mockResolvedValueOnce({
            data: { id: 'inst-1', activity_definition_id: 'act-1', sets: [{ id: 'set-1', metrics: [] }] },
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.updateInstance('inst-1', {
                sets: [{
                    instance_id: 'draft-set-1',
                    metrics: [
                        { metric_id: 'metric-1', value: '' },
                        { metric_id: 'metric-2', value: '   ' },
                        { metric_id: 'metric-3', value: null },
                        { metric_id: 'metric-4', value: '8' },
                    ],
                }],
            });
        });

        expect(updateActivityInstance).toHaveBeenCalledWith('root-1', 'inst-1', {
            session_id: 'session-1',
            activity_definition_id: 'act-1',
            sets: [{
                instance_id: 'draft-set-1',
                metrics: [{ metric_id: 'metric-4', value: '8' }],
            }],
        });
        expect(notify.error).not.toHaveBeenCalled();
    });

it('invalidates session list queries after timer actions update activity state', async () => {
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
        startActivityTimer.mockResolvedValueOnce({
            data: {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                time_start: '2026-03-12T15:00:00Z',
                time_stop: null,
            },
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.updateTimer('inst-1', 'start');
        });

        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.session('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessions('root-1') });
    });

it('lets the inline conflict action own expected active-timer feedback', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const conflict = {
            response: {
                data: {
                    code: 'active_work_exists',
                    error: 'Another session item is already accruing work time',
                },
            },
        };
        startActivityTimer.mockRejectedValueOnce(conflict);

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await expect(result.current.updateTimer('inst-1', 'start')).rejects.toBe(conflict);
        expect(notify.error).not.toHaveBeenCalled();
    });

it('replaces both activities in cache after completing and switching timers', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const activitiesKey = queryKeys.sessionActivities('root-1', 'session-1');
        queryClient.setQueryData(activitiesKey, [
            {
                id: 'inst-active',
                activity_definition_id: 'act-1',
                time_start: '2026-03-12T14:55:00Z',
                time_stop: null,
                completed: false,
            },
            {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                time_start: null,
                time_stop: null,
                completed: false,
            },
        ]);
        startActivityTimer.mockResolvedValueOnce({
            data: {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                time_start: '2026-03-12T15:00:00Z',
                time_stop: null,
                completed: false,
                completed_activity: {
                    id: 'inst-active',
                    activity_definition_id: 'act-1',
                    time_start: '2026-03-12T14:55:00Z',
                    time_stop: '2026-03-12T15:00:00Z',
                    completed: true,
                },
            },
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.updateTimer('inst-1', 'start', { switch: true });
        });

        expect(queryClient.getQueryData(activitiesKey)).toEqual([
            expect.objectContaining({
                id: 'inst-active',
                time_stop: '2026-03-12T15:00:00Z',
                completed: true,
            }),
            expect.objectContaining({
                id: 'inst-1',
                time_stop: null,
                completed: false,
            }),
        ]);
        expect(queryClient.getQueryData(activitiesKey)[1]).not.toHaveProperty('completed_activity');
    });

it('marks manual goal completion as completed in the active session and refreshes session lists', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        toggleGoalCompletion.mockResolvedValueOnce({
            data: {
                id: 'goal-1',
                name: 'Manual completion',
                type: 'ImmediateGoal',
                completed: true,
                completed_session_id: 'session-1',
                attributes: {
                    type: 'ImmediateGoal',
                    completed: true,
                    completed_session_id: 'session-1',
                },
                children: [],
            },
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.toggleGoalCompletion({ goalId: 'goal-1', completed: true });
        });

        expect(toggleGoalCompletion).toHaveBeenCalledWith('root-1', 'goal-1', true, 'session-1');
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.session('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessions('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionsAll('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionsPaginated('root-1') });
    });
});
