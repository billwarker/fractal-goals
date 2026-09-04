import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useProgramDayDetail, useProgramDayRange } from '../useProgramDayReadModel';

const getProgramDayReadModel = vi.fn();
vi.mock('../../utils/api', () => ({
    fractalApi: { getProgramDayReadModel: (...args) => getProgramDayReadModel(...args) },
}));

describe('useProgramDayDetail', () => {
    it('loads stable cursor pages and merges sessions by occurrence', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        getProgramDayReadModel
            .mockResolvedValueOnce({ data: {
                schema_version: 2,
                days: [{ date: '2026-09-02', state: 'scheduled_met' }],
                detail: {
                    occurrences: [{ occurrence_key: 'day:date', sessions: [{ id: 'session-1' }] }],
                    other_sessions: [],
                    sessions_page: { has_more: true, next_cursor: 'next' },
                },
            } })
            .mockResolvedValueOnce({ data: {
                schema_version: 2,
                days: [{ date: '2026-09-02', state: 'scheduled_met' }],
                detail: {
                    occurrences: [{ occurrence_key: 'day:date', sessions: [{ id: 'session-2' }] }],
                    other_sessions: [{ id: 'other-1' }],
                    sessions_page: { has_more: false, next_cursor: null },
                },
            } });

        const { result } = renderHook(
            () => useProgramDayDetail('root-1', 'program-1', 'America/Toronto', '2026-09-02'),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        await act(async () => {
            await result.current.fetchNextPage();
        });
        expect(getProgramDayReadModel).toHaveBeenCalledTimes(2);
        const raw = queryClient.getQueryData([
            'program-day-read-model', 'root-1', 'program-1',
            { timezone: 'America/Toronto', rangeStart: '2026-09-02', rangeEnd: '2026-09-02', detailDate: '2026-09-02' },
        ]);
        expect(raw.pages).toHaveLength(2);

        await waitFor(() => expect(
            result.current.data.detail.occurrences[0].sessions.map((item) => item.id),
        ).toEqual(['session-1', 'session-2']));
        expect(result.current.data.detail.other_sessions).toEqual([{ id: 'other-1' }]);
        expect(getProgramDayReadModel).toHaveBeenLastCalledWith('root-1', 'program-1', expect.objectContaining({
            session_cursor: 'next',
            timezone: 'America/Toronto',
        }));
    });

    it('rejects an incompatible read-model schema at the API boundary', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        getProgramDayReadModel.mockResolvedValueOnce({ data: { schema_version: 1 } });

        const { result } = renderHook(
            () => useProgramDayRange('root-1', 'program-1', 'UTC', {
                start: '2026-09-01',
                end: '2026-09-03',
            }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error.message).toMatch(/unsupported program day data version/i);
    });
});
