import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const updateCircuitMemberMetrics = vi.hoisted(() => vi.fn());

vi.mock('../../utils/api', () => ({
    fractalApi: { updateCircuitMemberMetrics },
}));

import { queryKeys } from '../queryKeys';
import { useCircuitRunActions } from '../useCircuitQueries';


describe('useCircuitRunActions member metric saves', () => {
    it('serializes authoritative run responses without entering the structural mutation state', async () => {
        let resolveFirst;
        const firstResponse = new Promise((resolve) => {
            resolveFirst = resolve;
        });
        updateCircuitMemberMetrics
            .mockReset()
            .mockReturnValueOnce(firstResponse)
            .mockResolvedValueOnce({ data: { id: 'run-1', revision: 2 } });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        queryClient.setQueryData(
            queryKeys.sessionCircuitRuns('root-1', 'session-1'),
            [{ id: 'run-1', revision: 0 }],
        );
        const wrapper = ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(
            () => useCircuitRunActions('root-1', 'session-1'),
            { wrapper },
        );

        let firstSave;
        let secondSave;
        act(() => {
            firstSave = result.current.saveMemberMetrics({
                runId: 'run-1', memberId: 'member-1', metrics: [{ metric_id: 'metric-1', value: 10 }],
            });
            secondSave = result.current.saveMemberMetrics({
                runId: 'run-1', memberId: 'member-2', metrics: [{ metric_id: 'metric-1', value: 20 }],
            });
        });

        await waitFor(() => expect(updateCircuitMemberMetrics).toHaveBeenCalledTimes(1));
        expect(result.current.isPending).toBe(false);

        resolveFirst({ data: { id: 'run-1', revision: 1 } });
        await firstSave;
        await waitFor(() => expect(updateCircuitMemberMetrics).toHaveBeenCalledTimes(2));
        await secondSave;

        expect(queryClient.getQueryData(queryKeys.sessionCircuitRuns('root-1', 'session-1'))).toEqual([
            { id: 'run-1', revision: 2 },
        ]);
        expect(result.current.isPending).toBe(false);
    });
});
