import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider, useAuth } from '../AuthContext';

const {
    authApi,
    setAccessToken,
    clearAccessToken,
    notify,
} = vi.hoisted(() => ({
    authApi: {
        getMe: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
        getCsrf: vi.fn(),
        signup: vi.fn(),
    },
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    notify: {
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    authApi,
    setAccessToken,
    clearAccessToken,
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function AuthHarness() {
    const { user, login, logout, setUser, loading } = useAuth();
    return (
        <div>
            <div data-testid="loading">{String(loading)}</div>
            <div data-testid="user-id">{user?.id || 'none'}</div>
            <button onClick={() => login('user-a', 'password')}>Login A</button>
            <button onClick={() => login('user-a', 'password', { rememberMe: true })}>Remember Login A</button>
            <button onClick={() => login('user-b', 'password')}>Login B</button>
            <button onClick={() => logout()}>Logout</button>
            <button onClick={() => setUser({ id: user?.id, username: 'renamed' })}>Update Same User</button>
        </div>
    );
}

function renderAuthHarness(queryClient = createQueryClient()) {
    const view = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AuthProvider>
                    <AuthHarness />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );

    return { queryClient, ...view };
}

describe('AuthContext cache boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            configurable: true,
        });
        authApi.getMe.mockRejectedValue({ response: { status: 401 } });
        authApi.refresh.mockRejectedValue({ response: { status: 401 } });
        authApi.getCsrf.mockResolvedValue({});
        authApi.logout.mockResolvedValue({});
    });

    it('refreshes a remembered browser session when the boot-time me request is stale', async () => {
        authApi.refresh.mockResolvedValueOnce({
            data: { token: 'fresh-token', user: { id: 'user-a', username: 'alpha' } },
        });

        renderAuthHarness();

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        expect(authApi.refresh).toHaveBeenCalledWith();
        expect(setAccessToken).toHaveBeenCalledWith('fresh-token');
        expect(authApi.getCsrf).toHaveBeenCalled();
    });

    it('does not store remember-me auth tokens in localStorage', async () => {
        renderAuthHarness();

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        authApi.login.mockResolvedValueOnce({
            data: { token: 'token-a', user: { id: 'user-a', username: 'alpha' } },
        });

        fireEvent.click(screen.getByText('Remember Login A'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        expect(localStorage.setItem).not.toHaveBeenCalled();
        expect(authApi.login).toHaveBeenCalledWith({
            username_or_email: 'user-a',
            password: 'password',
            remember_me: true,
        });
    });

    it('clears cached query data when logging into a different user', async () => {
        const { queryClient } = renderAuthHarness();

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        queryClient.setQueryData(['fractals', 'user-a'], [{ id: 'root-a' }]);
        authApi.login.mockResolvedValueOnce({
            data: { token: 'token-a', user: { id: 'user-a', username: 'alpha' } },
        });

        fireEvent.click(screen.getByText('Login A'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        expect(queryClient.getQueryData(['fractals', 'user-a'])).toBeUndefined();
        expect(setAccessToken).toHaveBeenCalledWith('token-a');
    });

    it('keeps cached query data when updating the same user object', async () => {
        const { queryClient } = renderAuthHarness();

        authApi.login.mockResolvedValueOnce({
            data: { token: 'token-a', user: { id: 'user-a', username: 'alpha' } },
        });
        fireEvent.click(screen.getByText('Login A'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        queryClient.setQueryData(['fractals', 'user-a'], [{ id: 'root-a' }]);

        fireEvent.click(screen.getByText('Update Same User'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });
        expect(queryClient.getQueryData(['fractals', 'user-a'])).toEqual([{ id: 'root-a' }]);
    });

    it('clears cached query data on logout', async () => {
        const { queryClient } = renderAuthHarness();

        authApi.login.mockResolvedValueOnce({
            data: { token: 'token-a', user: { id: 'user-a', username: 'alpha' } },
        });
        fireEvent.click(screen.getByText('Login A'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        queryClient.setQueryData(['fractals', 'user-a'], [{ id: 'root-a' }]);

        fireEvent.click(screen.getByText('Logout'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('none');
        });

        expect(queryClient.getQueryData(['fractals', 'user-a'])).toBeUndefined();
        expect(clearAccessToken).toHaveBeenCalled();
    });

    it('clears auth, cache, and notifies when the API reports a stale session', async () => {
        const { queryClient } = renderAuthHarness();

        authApi.login.mockResolvedValueOnce({
            data: { token: 'token-a', user: { id: 'user-a', username: 'alpha' } },
        });
        fireEvent.click(screen.getByText('Login A'));

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('user-a');
        });

        queryClient.setQueryData(['fractals', 'user-a'], [{ id: 'root-a' }]);
        act(() => {
            window.dispatchEvent(new CustomEvent('auth:session_expired', { detail: { reason: 'csrf_expired' } }));
        });

        await waitFor(() => {
            expect(screen.getByTestId('user-id')).toHaveTextContent('none');
        });

        expect(queryClient.getQueryData(['fractals', 'user-a'])).toBeUndefined();
        expect(clearAccessToken).toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledWith('Your session expired. Please log in again.');
    });
});
