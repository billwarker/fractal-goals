import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import usePersistedPaneOpen from '../usePersistedPaneOpen';

vi.mock('../useIsMobile', () => ({ getIsMobileViewport: () => false }));

describe('usePersistedPaneOpen', () => {
    afterEach(() => window.localStorage.clear());

    it('uses the default until a preference is stored, then remembers it', () => {
        const { result } = renderHook(() => usePersistedPaneOpen('pane:a', { defaultOpen: true }));
        expect(result.current[0]).toBe(true);
        act(() => result.current[1](false));
        expect(window.localStorage.getItem('pane:a')).toBe('false');
    });

    it('reloads the preference when the key changes', () => {
        window.localStorage.setItem('pane:b', 'false');
        const { result, rerender } = renderHook(({ key }) => usePersistedPaneOpen(key), { initialProps: { key: 'pane:a' } });
        expect(result.current[0]).toBe(true);
        rerender({ key: 'pane:b' });
        expect(result.current[0]).toBe(false);
    });

    it('closes when the layout becomes mobile', () => {
        const { result, rerender } = renderHook(
            ({ isMobile }) => usePersistedPaneOpen('pane:c', { isMobile }),
            { initialProps: { isMobile: false } },
        );
        expect(result.current[0]).toBe(true);
        rerender({ isMobile: true });
        expect(result.current[0]).toBe(false);
    });

    it('still works when storage throws', () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        const { result } = renderHook(() => usePersistedPaneOpen('pane:d', { defaultOpen: false }));
        expect(result.current[0]).toBe(false);
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        getItem.mockRestore();
        setItem.mockRestore();
    });
});
