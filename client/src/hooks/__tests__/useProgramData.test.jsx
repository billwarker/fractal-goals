import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useProgramData } from '../useProgramData';
import { queryKeys } from '../queryKeys';

const getProgram = vi.fn();
const getGoals = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getProgram: (...args) => getProgram(...args),
        getGoals: (...args) => getGoals(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useProgramData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invalidates related program queries, including list and active-day caches, on refresh', async () => {
        const queryClient = createQueryClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        getProgram.mockResolvedValueOnce({
            data: {
                id: 'program-1',
                blocks: [
                    {
                        id: 'block-1',
                        days: [
                            {
                                id: 'day-1',
                                sessions: [
                                    { id: 'session-1', name: 'Session 1' },
                                    { id: 'session-1', name: 'Session 1' },
                                ],
                            },
                        ],
                    },
                ],
            },
        });
        getGoals.mockResolvedValueOnce({ data: { id: 'root-1', children: [] } });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });

        const { result } = renderHook(
            () => useProgramData('root-1', 'program-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await result.current.refreshData();

        expect(result.current.sessions).toEqual([{ id: 'session-1', name: 'Session 1' }]);
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.program('root-1', 'program-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.programs('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.activeProgramDays('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionsAll('root-1') });
    });
});
