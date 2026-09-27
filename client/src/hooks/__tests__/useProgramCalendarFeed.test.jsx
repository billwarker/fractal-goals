import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useProgramCalendarFeed } from '../useProgramCalendarFeed';
import { queryKeys } from '../queryKeys';

const getProgramCalendarFeed = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getProgramCalendarFeed: (...args) => getProgramCalendarFeed(...args),
    },
}));

function chunk(month) {
    return {
        schema_version: 1,
        range: { start: `${month}-01`, end: `${month}-28` },
        programs: [{ id: 'p1', name: 'Base', start_date: '2026-01-01', end_date: '2026-12-31' }],
        blocks: [],
        program_days: [{ program_id: 'p1', date: `${month}-10`, scheduled: true, occurrences: [] }],
        completed_session_days: [],
        periods: [],
    };
}

function setup(initialRange) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const hook = renderHook(
        ({ range }) => useProgramCalendarFeed('root-1', 'UTC', range),
        { wrapper, initialProps: { range: initialRange } },
    );
    return { queryClient, ...hook };
}

const requestedMonths = () => getProgramCalendarFeed.mock.calls.map(([, params]) => params.range_start.slice(0, 7));

describe('useProgramCalendarFeed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getProgramCalendarFeed.mockImplementation(async (_rootId, params) => ({
            data: chunk(params.range_start.slice(0, 7)),
        }));
    });

    it('loads each visible month once and merges programs across chunks', async () => {
        const { result, queryClient } = setup({ start: '2026-08-30', end: '2026-10-10' });

        await waitFor(() => expect(result.current.feed.programDays).toHaveLength(3));
        expect(result.current.feed.programs).toHaveLength(1);
        expect(result.current.loadingMonths.size).toBe(0);
        expect(getProgramCalendarFeed).toHaveBeenCalledWith('root-1', {
            range_start: '2026-09-01', range_end: '2026-09-30', timezone: 'UTC',
        });
        expect(queryClient.getQueryData(queryKeys.programCalendarFeed('root-1', 'UTC', '2026-09'))).toBeTruthy();
    });

    it('prefetches one month either side while idle', async () => {
        setup({ start: '2026-09-06', end: '2026-09-26' });

        await waitFor(() => expect(requestedMonths()).toEqual(expect.arrayContaining(['2026-08', '2026-09', '2026-10'])));
        expect(requestedMonths()).not.toContain('2026-07');
    });

    it('reuses cached chunks when the view scrolls into a prefetched month', async () => {
        const { result, rerender } = setup({ start: '2026-09-06', end: '2026-09-26' });
        await waitFor(() => expect(requestedMonths()).toContain('2026-10'));
        const callsBefore = requestedMonths().filter((month) => month === '2026-10').length;

        rerender({ range: { start: '2026-10-04', end: '2026-10-31' } });

        await waitFor(() => expect(result.current.feed.programDays.map((day) => day.date)).toEqual(['2026-10-10']));
        expect(requestedMonths().filter((month) => month === '2026-10')).toHaveLength(callsBefore);
    });

    it('keeps loaded months while a newly visible month is still loading', async () => {
        const { result, rerender } = setup({ start: '2026-09-06', end: '2026-09-26' });
        await waitFor(() => expect(result.current.feed.programDays).toHaveLength(1));

        let release;
        getProgramCalendarFeed.mockImplementation((_rootId, params) => new Promise((resolve) => {
            release = () => resolve({ data: chunk(params.range_start.slice(0, 7)) });
        }));
        rerender({ range: { start: '2026-09-20', end: '2027-01-02' } });

        await waitFor(() => expect(result.current.loadingMonths.has('2027-01')).toBe(true));
        expect(result.current.feed.programDays.map((day) => day.date)).toContain('2026-09-10');
        release();
    });

    it('rejects an unsupported payload version', async () => {
        getProgramCalendarFeed.mockResolvedValue({ data: { schema_version: 99 } });
        const { result } = setup({ start: '2026-09-06', end: '2026-09-26' });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});
