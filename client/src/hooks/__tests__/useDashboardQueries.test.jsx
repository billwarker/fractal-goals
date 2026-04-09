import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAnalyticsViews } from '../useDashboardQueries';
import { queryKeys } from '../queryKeys';

const getAnalyticsViews = vi.fn();
const createAnalyticsView = vi.fn();
const updateAnalyticsView = vi.fn();
const deleteAnalyticsView = vi.fn();
const notifyError = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getAnalyticsViews: (...args) => getAnalyticsViews(...args),
        createAnalyticsView: (...args) => createAnalyticsView(...args),
        updateAnalyticsView: (...args) => updateAnalyticsView(...args),
        deleteAnalyticsView: (...args) => deleteAnalyticsView(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: {
        error: (...args) => notifyError(...args),
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useDashboardQueries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads analytics views under the shared query key and returns created payloads', async () => {
        const queryClient = createQueryClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

        getAnalyticsViews.mockResolvedValueOnce({
            data: {
                data: [{ id: 'view-1', name: 'Saved View' }],
            },
        });
        createAnalyticsView.mockResolvedValueOnce({
            data: {
                data: { id: 'view-2', name: 'New View' },
            },
        });

        const { result } = renderHook(
            () => useAnalyticsViews('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.analyticsViews).toEqual([{ id: 'view-1', name: 'Saved View' }]);
        });

        let created;
        await act(async () => {
            created = await result.current.createAnalyticsView({
                name: 'New View',
                layout: { version: 1 },
            });
        });

        expect(created).toEqual({ id: 'view-2', name: 'New View' });
        expect(queryClient.getQueryData(queryKeys.analyticsViews('root-1'))).toEqual([
            { id: 'view-1', name: 'Saved View' },
        ]);
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.analyticsViews('root-1') });
    });

    it('surfaces API errors through notify', async () => {
        const queryClient = createQueryClient();
        getAnalyticsViews.mockResolvedValueOnce({ data: { data: [] } });
        deleteAnalyticsView.mockRejectedValueOnce({
            response: {
                data: {
                    error: 'Delete failed',
                },
            },
        });

        const { result } = renderHook(
            () => useAnalyticsViews('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.analyticsViews).toEqual([]);
        });

        await expect(result.current.deleteAnalyticsView('view-1')).rejects.toEqual({
            response: {
                data: {
                    error: 'Delete failed',
                },
            },
        });
        expect(notifyError).toHaveBeenCalledWith('Delete failed');
    });
});
