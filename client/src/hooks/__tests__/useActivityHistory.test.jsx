import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useActivityHistory } from '../useActivityHistory';
import { queryKeys } from '../queryKeys';

const getActivityHistory = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getActivityHistory: (...args) => getActivityHistory(...args),
    },
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

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
}

describe('useActivityHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores fetched activity history under the shared query key', async () => {
        const queryClient = createQueryClient();
        getActivityHistory.mockResolvedValueOnce({
            data: [{ id: 'instance-1', session_name: 'Session A' }],
        });

        const { result } = renderHook(
            () => useActivityHistory('root-1', 'activity-1', 'session-1', { limit: 5 }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.history).toEqual([{ id: 'instance-1', session_name: 'Session A' }]);
        });

        expect(queryClient.getQueryData(queryKeys.activityHistory('root-1', 'activity-1', 'session-1', 5))).toEqual([
            { id: 'instance-1', session_name: 'Session A' },
        ]);
    });

    it('returns an inert empty state when no activity is selected', () => {
        const queryClient = createQueryClient();

        const { result } = renderHook(
            () => useActivityHistory('root-1', null, 'session-1'),
            { wrapper: createWrapper(queryClient) }
        );

        expect(result.current.history).toEqual([]);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(getActivityHistory).not.toHaveBeenCalled();
    });
});
