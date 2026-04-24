import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useProgramsPageData } from '../useProgramsPageData';
import { queryKeys } from '../queryKeys';

const getPrograms = vi.fn();
const getGoals = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getPrograms: (...args) => getPrograms(...args),
        getGoals: (...args) => getGoals(...args),
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

describe('useProgramsPageData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores programs and fractal tree data under canonical query keys', async () => {
        const queryClient = createQueryClient();

        getPrograms.mockResolvedValueOnce({ data: [{ id: 'program-1', name: 'Base' }] });
        getGoals.mockResolvedValueOnce({
            data: {
                id: 'root-1',
                name: 'Root',
                attributes: { id: 'root-1', type: 'UltimateGoal' },
                children: [],
            },
        });

        const { result } = renderHook(
            () => useProgramsPageData('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(queryClient.getQueryData(queryKeys.programs('root-1'))).toEqual([
            { id: 'program-1', name: 'Base' },
        ]);
        expect(queryClient.getQueryData(queryKeys.fractalTree('root-1'))).toEqual({
            id: 'root-1',
            name: 'Root',
            attributes: { id: 'root-1', type: 'UltimateGoal' },
            children: [],
        });
        expect(result.current.goals).toHaveLength(1);
        expect(result.current.treeData?.id).toBe('root-1');
    });
});
