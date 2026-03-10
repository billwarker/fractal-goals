import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionDetailMutations } from '../useSessionDetailMutations';

const {
    createGoal,
    addActivityToSession,
    notify,
} = vi.hoisted(() => ({
    createGoal: vi.fn(),
    addActivityToSession: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createGoal: (...args) => createGoal(...args),
        addActivityToSession: (...args) => addActivityToSession(...args),
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
        microGoals: [],
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
        expect(queryClient.getQueryData(queryKeys.sessionActivities('root-1', 'session-1'))).toEqual([
            { id: 'inst-1', activity_definition_id: 'act-1' },
            { id: 'inst-2', activity_definition_id: 'act-1' },
        ]);
        expect(draftState.sections[0].activity_ids).toEqual(['inst-1', 'inst-2']);
        expect(selectorState[0]).toBe(false);
    });
});
