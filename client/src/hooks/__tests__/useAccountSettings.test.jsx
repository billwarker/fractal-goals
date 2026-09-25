import { act, renderHook } from '@testing-library/react';

import { useAccountSettings } from '../useAccountSettings';

const {
    authApi,
    setAccessToken,
    signOutEverywhere,
    notify,
} = vi.hoisted(() => ({
    authApi: {
        updatePassword: vi.fn(),
    },
    setAccessToken: vi.fn(),
    signOutEverywhere: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user-a' }, setUser: vi.fn(), signOutEverywhere }),
}));

vi.mock('../../utils/api', () => ({
    authApi,
    globalApi: { getAllFractals: vi.fn() },
    setAccessToken: (...args) => setAccessToken(...args),
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

const submitEvent = { preventDefault: vi.fn() };

describe('useAccountSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('adopts the replacement token after a password change', async () => {
        authApi.updatePassword.mockResolvedValue({ data: { message: 'ok', token: 'replacement-token' } });
        const { result } = renderHook(() => useAccountSettings('general'));

        await act(async () => {
            await result.current.handlePasswordUpdate(submitEvent);
        });

        expect(setAccessToken).toHaveBeenCalledWith('replacement-token');
        expect(notify.success).toHaveBeenCalledWith('Password updated. Other devices have been signed out.');
    });

    it('does not clear the current token when a password response has none', async () => {
        authApi.updatePassword.mockResolvedValue({ data: { message: 'ok' } });
        const { result } = renderHook(() => useAccountSettings('general'));

        await act(async () => {
            await result.current.handlePasswordUpdate(submitEvent);
        });

        expect(setAccessToken).not.toHaveBeenCalled();
    });

    it('signs out everywhere only after confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { result } = renderHook(() => useAccountSettings('general'));

        await act(async () => {
            await result.current.handleSignOutEverywhere();
        });
        expect(signOutEverywhere).not.toHaveBeenCalled();

        window.confirm.mockReturnValue(true);
        signOutEverywhere.mockResolvedValue(undefined);
        await act(async () => {
            await result.current.handleSignOutEverywhere();
        });
        expect(signOutEverywhere).toHaveBeenCalledTimes(1);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('reports a failed sign out everywhere', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        signOutEverywhere.mockRejectedValue({ response: { data: { error: 'Server unavailable' } } });
        const { result } = renderHook(() => useAccountSettings('general'));

        await act(async () => {
            await result.current.handleSignOutEverywhere();
        });

        expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Failed to sign out of all devices'));
    });
});
