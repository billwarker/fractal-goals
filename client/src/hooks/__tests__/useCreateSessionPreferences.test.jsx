import { act, renderHook, waitFor } from '@testing-library/react';

import { useCreateSessionPreferences } from '../useCreateSessionPreferences';

describe('useCreateSessionPreferences', () => {
    let values;
    beforeEach(() => {
        values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => values.get(key) ?? null),
            setItem: vi.fn((key, value) => values.set(key, String(value))),
            removeItem: vi.fn((key) => values.delete(key)),
            clear: vi.fn(() => values.clear()),
        });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('hydrates with program scope enabled and persists opt-outs per program', async () => {
        const { result, unmount } = renderHook(() => useCreateSessionPreferences({
            rootId: 'root-1', userId: 'user-1',
        }));
        await waitFor(() => expect(result.current.isHydrated).toBe(true));
        expect(result.current.isProgramScopeEnabled('program-1')).toBe(true);

        act(() => result.current.setProgramScopeEnabled('program-1', false));
        expect(result.current.isProgramScopeEnabled('program-1')).toBe(false);
        expect(result.current.isProgramScopeEnabled('program-2')).toBe(true);
        await waitFor(() => expect(localStorage.getItem('create-session-preferences:user-1:root-1')).toContain('program-1'));
        unmount();

        const reloaded = renderHook(() => useCreateSessionPreferences({ rootId: 'root-1', userId: 'user-1' }));
        await waitFor(() => expect(reloaded.result.current.isHydrated).toBe(true));
        expect(reloaded.result.current.isProgramScopeEnabled('program-1')).toBe(false);
    });

    it('isolates preferences by user and root', async () => {
        localStorage.setItem('create-session-preferences:user-1:root-1', JSON.stringify({
            programScopeOptOut: { 'program-1': true },
        }));
        const { result } = renderHook(() => useCreateSessionPreferences({ rootId: 'root-2', userId: 'user-1' }));
        await waitFor(() => expect(result.current.isHydrated).toBe(true));
        expect(result.current.isProgramScopeEnabled('program-1')).toBe(true);
    });

    it('tolerates malformed storage', async () => {
        localStorage.setItem('create-session-preferences:user-1:root-1', '{bad');
        const { result } = renderHook(() => useCreateSessionPreferences({ rootId: 'root-1', userId: 'user-1' }));
        await waitFor(() => expect(result.current.isHydrated).toBe(true));
        expect(result.current.isProgramScopeEnabled('program-1')).toBe(true);
    });
});
