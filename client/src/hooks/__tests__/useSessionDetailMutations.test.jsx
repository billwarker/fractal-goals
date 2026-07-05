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
    notify,
} = vi.hoisted(() => ({
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    addActivityToSession: vi.fn(),
    startActivityTimer: vi.fn(),
    updateActivityInstance: vi.fn(),
    updateActivityMetrics: vi.fn(),
    toggleGoalCompletion: vi.fn(),
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

describe('useSessionDetailMutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invalidates the canonical goal and session query families when creating a goal', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        createGoal.mockResolvedValueOnce({
            data: { id: 'goal-1', name: 'New Goal' }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient)),
            { wrapper: createWrapper(queryClient) }
        );

        let createdGoal;
        await act(async () => {
            createdGoal = await result.current.createGoal({ name: 'New Goal' });
        });

        expect(createdGoal).toEqual({ id: 'goal-1', name: 'New Goal' });
        expect(createGoal).toHaveBeenCalledWith('root-1', { name: 'New Goal' });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goals('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goalsForSelection('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.session('root-1', 'session-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.activities('root-1') });
    });

    it('keeps the draft section ids and cached session activities aligned when adding an activity', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            { id: 'inst-1', activity_definition_id: 'act-1' }
        ]);

        let draftState = {
            sections: [{ activity_ids: ['inst-1'] }]
        };
        let selectorState = { 0: true };

        const options = createBaseOptions(queryClient, {
            updateSessionDataDraft: vi.fn((updater) => {
                draftState = typeof updater === 'function' ? updater(draftState) : updater;
            }),
            setShowActivitySelector: vi.fn((updater) => {
                selectorState = typeof updater === 'function' ? updater(selectorState) : updater;
            }),
        });

        addActivityToSession.mockResolvedValueOnce({
            data: { id: 'inst-2', activity_definition_id: 'act-1' }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(options),
            { wrapper: createWrapper(queryClient) }
        );

        let newInstance;
        await act(async () => {
            newInstance = await result.current.addActivity(0, 'act-1');
        });

        expect(newInstance).toEqual({ id: 'inst-2', activity_definition_id: 'act-1' });
        expect(addActivityToSession).toHaveBeenCalledWith('root-1', 'session-1', {
            activity_definition_id: 'act-1',
            section_index: 0,
        });
        expect(queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1'))).toEqual([
            { id: 'inst-1', activity_definition_id: 'act-1' },
            { id: 'inst-2', activity_definition_id: 'act-1' },
        ]);
        expect(draftState.sections[0].activity_ids).toEqual(['inst-1', 'inst-2']);
        expect(selectorState[0]).toBe(false);
    });

    it('duplicates an activity instance below the source with copied sets and reset completion state', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                completed: true,
                time_start: '2026-01-01T00:00:00Z',
                sets: [
                    {
                        instance_id: 'set-1',
                        completed: true,
                        metrics: [{ metric_id: 'metric-1', value: 8 }],
                    },
                ],
            },
            { id: 'inst-3', activity_definition_id: 'act-2' },
        ]);

        let draftState = {
            sections: [{ activity_ids: ['inst-1', 'inst-3'] }]
        };

        const options = createBaseOptions(queryClient, {
            activityInstances: queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1')),
            updateSessionDataDraft: vi.fn((updater) => {
                draftState = typeof updater === 'function' ? updater(draftState) : updater;
            }),
        });

        addActivityToSession.mockResolvedValueOnce({
            data: { id: 'inst-2', activity_definition_id: 'act-1' }
        });
        updateActivityInstance.mockResolvedValueOnce({
            data: { id: 'inst-2', activity_definition_id: 'act-1', sets: [] }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(options),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.duplicateActivityInstance(0, 'inst-1', 0);
        });

        expect(addActivityToSession).toHaveBeenCalledWith('root-1', 'session-1', {
            activity_definition_id: 'act-1',
            section_index: 0,
        });
        expect(updateActivityInstance).toHaveBeenCalledWith('root-1', 'inst-2', expect.objectContaining({
            session_id: 'session-1',
            activity_definition_id: 'act-1',
            completed: false,
            time_start: null,
            time_stop: null,
            duration_seconds: null,
            target_duration_seconds: null,
            sets: [
                expect.objectContaining({
                    completed: false,
                    metrics: [{ metric_id: 'metric-1', split_id: null, value: 8 }],
                }),
            ],
        }));
        expect(draftState.sections[0].activity_ids).toEqual(['inst-1', 'inst-2', 'inst-3']);
        expect(notify.success).toHaveBeenCalledWith('Activity instance duplicated');
    });

    it('clears flat metric values and timer/completion fields for an activity instance', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        queryClient.setQueryData(queryKeys.sessionActivities('root-1', 'session-1'), [
            {
                id: 'inst-1',
                activity_definition_id: 'act-1',
                completed: true,
                time_start: '2026-01-01T00:00:00Z',
                metrics: [{ metric_id: 'metric-1', value: 8 }],
            },
        ]);

        updateActivityMetrics.mockResolvedValueOnce({
            data: { id: 'inst-1', activity_definition_id: 'act-1', metrics: [] }
        });
        updateActivityInstance.mockResolvedValueOnce({
            data: { id: 'inst-1', activity_definition_id: 'act-1', completed: false }
        });

        const { result } = renderHook(
            () => useSessionDetailMutations(createBaseOptions(queryClient, {
                activityInstances: queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1')),
            })),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.clearActivityInstanceValues('inst-1');
        });

        expect(updateActivityMetrics).toHaveBeenCalledWith('root-1', 'session-1', 'inst-1', { metrics: [] });
        expect(updateActivityInstance).toHaveBeenCalledWith('root-1', 'inst-1', expect.objectContaining({
            session_id: 'session-1',
            activity_definition_id: 'act-1',
            completed: false,
            time_start: null,
            time_stop: null,
            duration_seconds: null,
            target_duration_seconds: null,
        }));
        expect(notify.success).toHaveBeenCalledWith('Activity values cleared');
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

    it('updates the session goals view cache when adding an associated activity', async () => {
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

        expect(draftState.sections[0].activity_ids).toEqual(['inst-2']);
        expect(queryClient.getQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'))).toMatchObject({
            session_activity_ids: ['act-2'],
            session_goal_ids: [],
            activity_goal_ids_by_activity: {
                'act-2': ['goal-1'],
            },
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
