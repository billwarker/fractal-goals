import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useGoalAssociationMutations } from '../useGoalAssociationMutations';

const setGoalAssociationsBatch = vi.fn();
const setActivityGoals = vi.fn();
const invalidateGoalAssociationQueries = vi.fn(() => Promise.resolve());
const logError = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setGoalAssociationsBatch: (...args) => setGoalAssociationsBatch(...args),
        setActivityGoals: (...args) => setActivityGoals(...args),
    }
}));

vi.mock('../../components/goals/goalDetailQueryUtils', () => ({
    invalidateGoalAssociationQueries: (...args) => invalidateGoalAssociationQueries(...args),
}));

vi.mock('../../utils/logger', () => ({
    logError: (...args) => logError(...args),
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useGoalAssociationMutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists changed goal associations and invalidates shared queries', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-1',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [{ id: 'activity-1', name: 'A' }],
            fetchedGroups: [{ id: 'group-1', name: 'G' }],
        }), { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
            expect(result.current.associatedActivities).toHaveLength(1);
        });

        await act(async () => {
            await result.current.persistAssociations(
                [
                    { id: 'activity-1', name: 'A' },
                    { id: 'activity-2', name: 'B' },
                ],
                [{ id: 'group-1', name: 'G' }],
            );
        });

        expect(setGoalAssociationsBatch).toHaveBeenCalledWith('root-1', 'goal-1', {
            activity_ids: ['activity-1', 'activity-2'],
            group_ids: ['group-1'],
        });
        expect(invalidateGoalAssociationQueries).toHaveBeenCalledWith(queryClient, 'root-1', 'goal-1');
    });

    it('skips persistence when goal associations are unchanged', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-1',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [{ id: 'activity-1', name: 'A' }],
            fetchedGroups: [{ id: 'group-1', name: 'G' }],
        }), { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
            expect(result.current.associatedActivities).toHaveLength(1);
            expect(result.current.associatedActivityGroups).toHaveLength(1);
        });

        await act(async () => {
            await result.current.persistAssociations();
        });

        expect(setGoalAssociationsBatch).not.toHaveBeenCalled();
        expect(invalidateGoalAssociationQueries).not.toHaveBeenCalled();
    });

    it('buffers inline-created activities in create mode without persisting immediately', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: null,
            mode: 'create',
            isOpen: true,
            activityGroupsRaw: [],
            initialActivities: [],
            initialActivityGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        await act(async () => {
            await result.current.attachInlineCreatedActivity({ id: 'activity-2', name: 'Inline Created' });
        });

        expect(result.current.associatedActivities.map((activity) => activity.id)).toEqual(['activity-2']);
        expect(setActivityGoals).not.toHaveBeenCalled();
    });

    it('preserves builder-selected goals when attaching an inline-created activity in edit mode', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-current',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [],
            fetchedGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        await act(async () => {
            await result.current.attachInlineCreatedActivity({
                id: 'activity-2',
                name: 'Inline Created',
                associated_goal_ids: ['goal-other'],
            });
        });

        expect(setActivityGoals).toHaveBeenCalledWith('root-1', 'activity-2', ['goal-other', 'goal-current']);
        expect(invalidateGoalAssociationQueries).toHaveBeenCalledWith(queryClient, 'root-1', 'goal-current');
    });

    it('does not rewrite goal associations already persisted by inline creation', async () => {
        invalidateGoalAssociationQueries.mockRejectedValueOnce(new Error('temporary refresh failure'));
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-current',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [],
            fetchedGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        let attachmentResult;
        await act(async () => {
            attachmentResult = await result.current.attachInlineCreatedActivity({
                id: 'activity-2',
                name: 'Inline Created',
                associated_goal_ids: ['goal-current'],
            });
        });

        expect(attachmentResult).toEqual({
            associatedImmediately: true,
            persistedDuringCreate: true,
        });
        expect(setActivityGoals).not.toHaveBeenCalled();
        expect(invalidateGoalAssociationQueries).toHaveBeenCalledWith(queryClient, 'root-1', 'goal-current');
    });

    it('reports partial success when the compatibility association fallback fails', async () => {
        setActivityGoals.mockRejectedValueOnce(new Error('association unavailable'));
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-current',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [],
            fetchedGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        let attachmentResult;
        await act(async () => {
            attachmentResult = await result.current.attachInlineCreatedActivity({
                id: 'activity-2',
                name: 'Inline Created',
                associated_goal_ids: [],
            });
        });

        expect(attachmentResult).toEqual({
            associatedImmediately: false,
            persistedDuringCreate: false,
        });
    });

    it('persists only direct activity associations when inherited activities are present', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-1',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [
                { id: 'activity-direct', name: 'Direct Activity', has_direct_association: true },
                { id: 'activity-hybrid', name: 'Hybrid Activity', has_direct_association: true, inherited_from_children: true },
                { id: 'activity-inherited', name: 'Inherited Only', has_direct_association: false, inherited_from_children: true },
                { id: 'activity-parent', name: 'Parent Only', has_direct_association: false, inherited_from_parent: true },
            ],
            fetchedGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
            expect(result.current.associatedActivities).toHaveLength(4);
        });

        await act(async () => {
            await result.current.persistAssociations([
                ...result.current.associatedActivities,
                { id: 'activity-new', name: 'New Direct Activity', has_direct_association: true },
            ]);
        });

        expect(setGoalAssociationsBatch).toHaveBeenCalledWith('root-1', 'goal-1', {
            activity_ids: ['activity-direct', 'activity-hybrid', 'activity-new'],
            group_ids: [],
        });
    });

    it('treats unchanged inherited activities as a no-op', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        });

        const { result } = renderHook(() => useGoalAssociationMutations({
            rootId: 'root-1',
            goalId: 'goal-1',
            mode: 'edit',
            isOpen: true,
            activityGroupsRaw: [],
            fetchedActivities: [
                { id: 'activity-direct', has_direct_association: true },
                { id: 'activity-inherited', has_direct_association: false, inherited_from_children: true },
            ],
            fetchedGroups: [],
        }), { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
            expect(result.current.associatedActivities).toHaveLength(2);
        });

        await act(async () => {
            await result.current.persistAssociations();
        });

        expect(setGoalAssociationsBatch).not.toHaveBeenCalled();
    });
});
