import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useSecondTicker from '../useSecondTicker';

afterEach(() => vi.useRealTimers());

describe('useSecondTicker', () => {
    it('gives every subscriber the same time on the same tick, from one interval', () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00.400Z'));
        const setInterval = vi.spyOn(window, 'setInterval');
        const card = renderHook(() => useSecondTicker(true));
        vi.setSystemTime(new Date('2026-01-01T00:00:00.900Z'));
        const total = renderHook(() => useSecondTicker(true));
        // The later subscriber joins the running clock rather than starting its own phase.
        expect(total.result.current).toBe(card.result.current);
        expect(setInterval).toHaveBeenCalledTimes(1);
        const before = card.result.current;
        act(() => { vi.advanceTimersByTime(1000); });
        expect(card.result.current).toBe(total.result.current);
        expect(card.result.current).toBeGreaterThan(before);
        card.unmount();
        total.unmount();
    });

    it('starts from the current time and stops when nothing subscribes', () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
        const clearInterval = vi.spyOn(window, 'clearInterval');
        const idle = renderHook(() => useSecondTicker(false));
        const live = renderHook(() => useSecondTicker(true));
        expect(live.result.current).toBe(new Date('2026-01-01T00:05:00Z').getTime());
        live.unmount();
        expect(clearInterval).toHaveBeenCalled();
        idle.unmount();
    });
});
