import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useProgramLogic } from '../useProgramLogic';

const addBlockDay = vi.fn();
const scheduleBlockDay = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        addBlockDay: (...args) => addBlockDay(...args),
        scheduleBlockDay: (...args) => scheduleBlockDay(...args),
    },
}));

vi.mock('../../utils/dateUtils', () => ({
    localToISO: vi.fn(() => '2026-03-16T12:00:00Z'),
}));

describe('useProgramLogic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        addBlockDay.mockResolvedValue({ data: { message: 'ok' } });
        scheduleBlockDay.mockResolvedValue({ data: { id: 'session-1' } });
    });

    it('schedules an existing program day through the programs API', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useProgramLogic('root-1', { id: 'program-1', blocks: [] }, refreshData));

        await act(async () => {
            await result.current.scheduleDay('block-1', '2026-03-16', { id: 'day-1', name: 'Template Day' });
        });

        expect(scheduleBlockDay).toHaveBeenCalledWith(
            'root-1',
            'program-1',
            'block-1',
            'day-1',
            { session_start: '2026-03-16T12:00:00Z' }
        );
        expect(refreshData).toHaveBeenCalledTimes(1);
        expect(addBlockDay).not.toHaveBeenCalled();
    });

    it('creates a dated block day when scheduling from scratch', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useProgramLogic('root-1', { id: 'program-1', blocks: [] }, refreshData));

        await act(async () => {
            await result.current.scheduleDay('block-1', '2026-03-16', null);
        });

        expect(addBlockDay).toHaveBeenCalledWith('root-1', 'program-1', 'block-1', {
            name: 'Day 2026-03-16',
            date: '2026-03-16',
            template_ids: [],
        });
        expect(refreshData).toHaveBeenCalledTimes(1);
        expect(scheduleBlockDay).not.toHaveBeenCalled();
    });
});
