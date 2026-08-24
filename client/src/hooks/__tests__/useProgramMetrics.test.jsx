import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { queryKeys } from '../queryKeys';
import { useProgramMetrics } from '../useProgramMetrics';

const getProgramMetrics = vi.fn();
vi.mock('../../utils/api', () => ({
    fractalApi: { getProgramMetrics: (...args) => getProgramMetrics(...args) },
}));

const wrapperFor = (client) => function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useProgramMetrics', () => {
    it('keys every result by root, program, timezone, and range', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        getProgramMetrics.mockResolvedValue({ data: { calculation_version: 1 } });
        const range = { start: '2025-01-01', end: '2025-12-31' };
        const { result } = renderHook(
            () => useProgramMetrics('root-1', 'program-1', 'America/Toronto', range),
            { wrapper: wrapperFor(client) },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(getProgramMetrics).toHaveBeenCalledWith('root-1', 'program-1', {
            timezone: 'America/Toronto',
            range_start: range.start,
            range_end: range.end,
        });
        expect(client.getQueryData(queryKeys.programMetrics(
            'root-1', 'program-1', 'America/Toronto', range.start, range.end,
        ))).toEqual({ calculation_version: 1 });
    });

    it('schedules invalidation for the caller’s next local midnight', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-24T20:00:00'));
        const timeoutSpy = vi.spyOn(window, 'setTimeout');
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        getProgramMetrics.mockReturnValue(new Promise(() => {}));
        renderHook(
            () => useProgramMetrics('root-1', 'program-1', 'America/Toronto'),
            { wrapper: wrapperFor(client) },
        );
        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 14_400_050);
    });
});
