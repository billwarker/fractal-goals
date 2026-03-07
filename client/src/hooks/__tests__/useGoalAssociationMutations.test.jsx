import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import useGoalAssociationMutations from '../useGoalAssociationMutations';

const setGoalAssociationsBatch = vi.fn();
const setActivityGoals = vi.fn();
const invalidateGoalAssociationQueries = vi.fn(() => Promise.resolve());

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setGoalAssociationsBatch: (...args) => setGoalAssociationsBatch(...args),
        setActivityGoals: (...args) => setActivityGoals(...args),
    }
}));

vi.mock('../../components/goals/goalDetailQueryUtils', () => ({
    invalidateGoalAssociationQueries: (...args) => invalidateGoalAssociationQueries(...args),
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

    it('persists goal associations and invalidates shared queries', async () => {
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
            await result.current.persistAssociations();
        });

        expect(setGoalAssociationsBatch).toHaveBeenCalledWith('root-1', 'goal-1', {
            activity_ids: ['activity-1'],
            group_ids: ['group-1'],
        });
        expect(invalidateGoalAssociationQueries).toHaveBeenCalledWith(queryClient, 'root-1', 'goal-1');
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
});
