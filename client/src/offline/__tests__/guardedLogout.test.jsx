import React from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutboxContext, useConfirmUnsyncedChanges, useGuardedLogout } from '../OutboxContext';
import { createMemoryStore, createOutbox } from '../outbox';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout }) }));

async function outboxWithPending(count) {
    const outbox = createOutbox({ store: createMemoryStore(), send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
    for (let index = 0; index < count; index += 1) {
        await outbox.submit({ scope: 's', kind: 'k', method: 'put', url: `/x/${index}` });
    }
    return outbox;
}

const wrapperFor = (outbox) => function Wrapper({ children }) {
    return <OutboxContext.Provider value={outbox}>{children}</OutboxContext.Provider>;
};

describe('sign-out guards', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        logout.mockReset();
    });

    it('signs out without asking when nothing is waiting to sync', async () => {
        const confirm = vi.spyOn(window, 'confirm');
        const { result } = renderHook(() => useGuardedLogout(), { wrapper: wrapperFor(await outboxWithPending(0)) });

        result.current();

        expect(confirm).not.toHaveBeenCalled();
        expect(logout).toHaveBeenCalled();
    });

    it('asks first and stays signed in when the user cancels', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { result } = renderHook(() => useGuardedLogout(), { wrapper: wrapperFor(await outboxWithPending(2)) });

        result.current();

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining("2 changes haven't synced yet"));
        expect(logout).not.toHaveBeenCalled();
    });

    it('names the action in the question', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { result } = renderHook(() => useConfirmUnsyncedChanges(), { wrapper: wrapperFor(await outboxWithPending(1)) });

        expect(result.current('Sign out of all devices')).toBe(true);
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 change hasn't synced yet"));
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Sign out of all devices anyway?'));
    });
});
