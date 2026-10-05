import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../useProgramSessionPlans', () => ({
    useProgramPlanOccurrences: () => ({ data: new Map(), isLoading: false, error: null }),
}));

import useProgramDaysTab from '../useProgramDaysTab';

const program = {
    id: 'program-1',
    days: [
        { id: 'a', name: 'A', day_number: 1, templates: [] },
        { id: 'b', name: 'B', day_number: 2, templates: [] },
        { id: 'c', name: 'C', day_number: 3, templates: [] },
    ],
};

function renderTab(onReorderDays) {
    return renderHook(() => useProgramDaysTab({
        rootId: 'root', program, today: '2026-10-05', timezone: 'UTC', enabled: true,
        setViewMode: vi.fn(), onLeavePane: vi.fn(), onCreateDay: vi.fn(), onEditDay: vi.fn(), onReorderDays,
    }));
}

const names = (result) => result.current.days.map((day) => day.name);

describe('useProgramDaysTab day order', () => {
    it('shows a move at once and saves the full order', async () => {
        let finish;
        const onReorderDays = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
        const { result } = renderTab(onReorderDays);

        let pending;
        act(() => { pending = result.current.navigator.props.onMoveDay('c', -1); });

        expect(names(result)).toEqual(['A', 'C', 'B']);
        expect(onReorderDays).toHaveBeenCalledWith(['a', 'c', 'b']);
        await act(async () => { finish(); await pending; });
    });

    it('returns to the saved order when the save fails', async () => {
        const onReorderDays = vi.fn().mockRejectedValue(new Error('offline'));
        const { result } = renderTab(onReorderDays);

        await act(async () => { await result.current.navigator.props.onMoveDay('a', 1); });

        expect(names(result)).toEqual(['A', 'B', 'C']);
    });

    it('ignores moves past either end', async () => {
        const onReorderDays = vi.fn();
        const { result } = renderTab(onReorderDays);

        await act(async () => { await result.current.navigator.props.onMoveDay('a', -1); });

        expect(onReorderDays).not.toHaveBeenCalled();
    });
});
