import { act, renderHook } from '@testing-library/react';
import useFadeSwap from '../useFadeSwap';

describe('useFadeSwap', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('fades the old content out, waits for the new content, then fades it in', () => {
        const { result, rerender } = renderHook(({ value, contentKey, ready }) => useFadeSwap(value, contentKey, ready), {
            initialProps: { value: 'same tags', contentKey: 'a', ready: true },
        });
        expect(result.current).toEqual({ value: 'same tags', visible: true });

        // Same key: updates show at once.
        rerender({ value: 'same tags, refreshed', contentKey: 'a', ready: true });
        expect(result.current).toEqual({ value: 'same tags, refreshed', visible: true });

        // New key, still loading (previous data kept): the old content fades out.
        rerender({ value: 'same tags, refreshed', contentKey: 'b', ready: false });
        expect(result.current).toEqual({ value: 'same tags, refreshed', visible: false });
        act(() => vi.advanceTimersByTime(200));
        expect(result.current.visible).toBe(false);

        // Loaded: the new content arrives hidden, then fades in.
        rerender({ value: 'all history', contentKey: 'b', ready: true });
        expect(result.current).toEqual({ value: 'all history', visible: false });
        act(() => vi.advanceTimersByTime(20));
        expect(result.current).toEqual({ value: 'all history', visible: true });
    });
});
