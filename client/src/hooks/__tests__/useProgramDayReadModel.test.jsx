import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
    useProgramDayDetail,
    useProgramDayRange,
    useSetProgramDaySessionCredit,
    useUpdateProgramDayStatuses,
} from '../useProgramDayReadModel';

const getProgramDayReadModel = vi.fn();
const updateProgramDayStatuses = vi.fn();
const updateProgramDaySessionCredit = vi.fn();
vi.mock('../../utils/api', () => ({
    fractalApi: {
        getProgramDayReadModel: (...args) => getProgramDayReadModel(...args),
        updateProgramDayStatuses: (...args) => updateProgramDayStatuses(...args),
        updateProgramDaySessionCredit: (...args) => updateProgramDaySessionCredit(...args),
    },
}));

describe('useProgramDayDetail', () => {
    it('loads stable cursor pages and merges the date session list', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        const occurrences = [{ occurrence_key: 'day:date', credits: [{ session_id: 'session-2' }] }];
        getProgramDayReadModel
            .mockResolvedValueOnce({ data: {
                schema_version: 5,
                days: [{ date: '2026-09-02', state: 'scheduled_met' }],
                detail: {
                    occurrences,
                    summary: { session_count: 3 },
                    sessions: [{ id: 'session-1' }, { id: 'other-1' }],
                    sessions_page: { has_more: true, next_cursor: 'next' },
                },
            } })
            .mockResolvedValueOnce({ data: {
                schema_version: 5,
                days: [{ date: '2026-09-02', state: 'scheduled_met' }],
                detail: {
                    occurrences,
                    summary: { session_count: 3 },
                    sessions: [{ id: 'session-2' }],
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
            result.current.data.detail.sessions.map((item) => item.id),
        ).toEqual(['session-1', 'other-1', 'session-2']));
        expect(result.current.data.detail.occurrences).toEqual(occurrences);
        expect(result.current.data.detail.summary).toEqual({ session_count: 3 });
        expect(result.current.data.detail.sessions_page).toEqual({ has_more: false, next_cursor: null });
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

describe('useUpdateProgramDayStatuses', () => {
    it('sends one bulk mutation and invalidates program read models', async () => {
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        updateProgramDayStatuses.mockResolvedValueOnce({ data: { updated_count: 2 } });
        const { result } = renderHook(
            () => useUpdateProgramDayStatuses('root-1', 'program-1'),
            { wrapper },
        );

        await act(async () => {
            await result.current.mutateAsync({ dates: ['2026-09-01', '2026-09-03'], status: 'rest', timezone: 'UTC' });
        });

        expect(updateProgramDayStatuses).toHaveBeenCalledWith('root-1', 'program-1', expect.objectContaining({ status: 'rest' }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['program-day-read-model', 'root-1', 'program-1'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['program-metrics', 'root-1'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['programs', 'root-1'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['program-day-options', 'root-1'] });
    });
});

describe('useSetProgramDaySessionCredit', () => {
    it('writes the returned day into the detail cache and invalidates every other projection', async () => {
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        const day = { schema_version: 5, detail: { state: 'scheduled_met', sessions: [] } };
        updateProgramDaySessionCredit.mockResolvedValueOnce({ data: { disposition: 'credit', day } });
        const { result } = renderHook(
            () => useSetProgramDaySessionCredit('root-1', 'program-1', 'America/Toronto'),
            { wrapper },
        );

        await act(async () => {
            await result.current.mutateAsync({
                date: '2026-09-02', sessionId: 'session-1', disposition: 'credit', templateId: 'template-2',
            });
        });

        expect(updateProgramDaySessionCredit).toHaveBeenCalledWith('root-1', 'program-1', {
            date: '2026-09-02',
            session_id: 'session-1',
            disposition: 'credit',
            template_id: 'template-2',
            timezone: 'America/Toronto',
        });
        const detailKey = [
            'program-day-read-model', 'root-1', 'program-1',
            { timezone: 'America/Toronto', rangeStart: '2026-09-02', rangeEnd: '2026-09-02', detailDate: '2026-09-02' },
        ];
        expect(queryClient.getQueryData(detailKey)).toEqual({ pages: [day], pageParams: [null] });
        const readModelCall = invalidate.mock.calls.find(([filters]) => (
            filters.queryKey.join('/') === 'program-day-read-model/root-1/program-1'
        ))[0];
        expect(readModelCall.predicate({ queryKey: detailKey })).toBe(false);
        expect(readModelCall.predicate({ queryKey: ['program-day-read-model', 'root-1', 'program-1', { rangeStart: '2026-09-01' }] })).toBe(true);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['program-metrics', 'root-1'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['program-day-options', 'root-1'] });
    });

    it('omits template_id for exclusions and rejects an unsupported returned day', async () => {
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        updateProgramDaySessionCredit.mockResolvedValueOnce({ data: { day: { schema_version: 3 } } });
        const { result } = renderHook(
            () => useSetProgramDaySessionCredit('root-1', 'program-1', null),
            { wrapper },
        );

        await expect(result.current.mutateAsync({
            date: '2026-09-02', sessionId: 'session-1', disposition: 'exclude',
        })).rejects.toThrow(/unsupported program day data version/i);
        expect(updateProgramDaySessionCredit).toHaveBeenLastCalledWith('root-1', 'program-1', {
            date: '2026-09-02', session_id: 'session-1', disposition: 'exclude', timezone: 'UTC',
        });
    });
});
