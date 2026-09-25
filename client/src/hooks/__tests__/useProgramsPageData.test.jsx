import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useProgramsCalendarData } from '../useProgramsCalendarData';
import { queryKeys } from '../queryKeys';

const getProgramSummaries = vi.fn();
const getGoals = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getProgramSummaries: (...args) => getProgramSummaries(...args),
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

describe('useProgramsCalendarData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores programs and fractal tree data under canonical query keys', async () => {
        const queryClient = createQueryClient();

        getProgramSummaries.mockResolvedValueOnce({ data: [{ id: 'program-1', name: 'Base', start_date: '2026-01-01', end_date: '2026-02-01' }] });
        getGoals.mockResolvedValueOnce({
            data: {
                id: 'root-1',
                name: 'Root',
                attributes: { id: 'root-1', type: 'UltimateGoal' },
                children: [],
            },
        });

        const { result } = renderHook(
            () => useProgramsCalendarData('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(queryClient.getQueryData(queryKeys.programCalendar('root-1', 'UTC'))).toEqual([
            { id: 'program-1', name: 'Base', start_date: '2026-01-01', end_date: '2026-02-01' },
        ]);
        expect(queryClient.getQueryData(queryKeys.fractalTree('root-1'))).toEqual({
            id: 'root-1',
            name: 'Root',
            attributes: { id: 'root-1', type: 'UltimateGoal' },
            children: [],
        });
        expect(result.current.goals).toHaveLength(1);
        expect(result.current.treeData?.id).toBe('root-1');
        expect(result.current.programLabels).toEqual(expect.arrayContaining([
            expect.objectContaining({ title: 'Base', date: '2026-01-01', labelType: 'program' }),
        ]));
        expect(getProgramSummaries).toHaveBeenCalledWith('root-1', { timezone: 'UTC' });
    });
});
