import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useProgramLogic } from '../useProgramLogic';

const api = {
    createProgramDay: vi.fn(),
    updateProgramDay: vi.fn(),
    duplicateProgramDay: vi.fn(),
    reorderProgramDays: vi.fn(),
    scheduleProgramDay: vi.fn(),
    moveProgramDayOccurrence: vi.fn().mockResolvedValue({ data: { target_date: '2026-03-17' } }),
    updateBlock: vi.fn(),
    createBlock: vi.fn(),
};

vi.mock('../../utils/api', () => ({
    fractalApi: new Proxy({}, { get: (_target, name) => (...args) => api[name](...args) }),
}));

const program = { id: 'program-1', blocks: [{ id: 'block-1' }], days: [] };

describe('useProgramLogic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.createProgramDay.mockResolvedValue({ data: { id: 'day-new', name: 'Legs' } });
        api.updateProgramDay.mockResolvedValue({ data: { id: 'day-1', name: 'Legs' } });
        api.duplicateProgramDay.mockResolvedValue({ data: { id: 'day-copy', name: 'Legs (copy)' } });
        api.reorderProgramDays.mockResolvedValue({ data: { days: [] } });
        api.scheduleProgramDay.mockResolvedValue({ data: { id: 'schedule-1', program_day_id: 'day-1', date: '2026-03-16' } });
        api.updateBlock.mockResolvedValue({ data: {} });
        api.createBlock.mockResolvedValue({ data: {} });
    });

    it('schedules an existing program day as a dated occurrence', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useProgramLogic('root-1', program, refreshData));

        await act(async () => {
            await result.current.scheduleDay('2026-03-16', { id: 'day-1', name: 'Template Day' });
        });

        expect(api.scheduleProgramDay).toHaveBeenCalledWith('root-1', 'program-1', 'day-1', { date: '2026-03-16' });
        expect(refreshData).toHaveBeenCalled();
    });

    it('moves an occurrence and refreshes scheduling read models', async () => {
        const refresh = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useProgramLogic('root-1', program, refresh));
        await act(async () => result.current.moveDay('day-1', '2026-03-16', '2026-03-17'));
        expect(api.moveProgramDayOccurrence).toHaveBeenCalledWith('root-1', 'program-1', 'day-1', {
            source_date: '2026-03-16', target_date: '2026-03-17',
        });
        expect(refresh).toHaveBeenCalled();
    });

    it('creates program days on the program and returns the saved day', async () => {
        const { result } = renderHook(() => useProgramLogic('root-1', program, vi.fn().mockResolvedValue(undefined)));

        let created;
        let updated;
        await act(async () => {
            created = await result.current.saveDay(null, { name: 'Legs', day_of_week: ['Monday'] });
            updated = await result.current.saveDay('day-1', { name: 'Legs' });
        });

        expect(api.createProgramDay).toHaveBeenCalledWith('root-1', 'program-1', { name: 'Legs', day_of_week: ['Monday'] });
        expect(api.updateProgramDay).toHaveBeenCalledWith('root-1', 'program-1', 'day-1', { name: 'Legs' });
        expect(created).toEqual({ id: 'day-new', name: 'Legs' });
        expect(updated).toEqual({ id: 'day-1', name: 'Legs' });
    });

    it('duplicates a day into an unscheduled copy', async () => {
        const { result } = renderHook(() => useProgramLogic('root-1', program, vi.fn().mockResolvedValue(undefined)));

        let copy;
        await act(async () => {
            copy = await result.current.duplicateDay('day-1');
        });

        expect(api.duplicateProgramDay).toHaveBeenCalledWith('root-1', 'program-1', 'day-1');
        expect(copy.name).toBe('Legs (copy)');
    });

    it('saves the program\'s day order', async () => {
        const { result } = renderHook(() => useProgramLogic('root-1', program, vi.fn().mockResolvedValue(undefined)));

        await act(async () => {
            await result.current.reorderDays(['day-2', 'day-1']);
        });

        expect(api.reorderProgramDays).toHaveBeenCalledWith('root-1', 'program-1', ['day-2', 'day-1']);
    });

    it('sends week tracking with block saves', async () => {
        const { result } = renderHook(() => useProgramLogic('root-1', program, vi.fn().mockResolvedValue(undefined)));

        await act(async () => {
            await result.current.saveBlock({
                id: 'block-1', name: 'Month 1', startDate: '2026-09-01', endDate: '2026-09-30',
                color: '#be2004', track_weeks: true, week_start_day: 6,
            });
        });

        expect(api.updateBlock).toHaveBeenCalledWith('root-1', 'program-1', 'block-1', {
            name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30', color: '#be2004',
            track_weeks: true, week_start_day: 6,
        });
    });
});
