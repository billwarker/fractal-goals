import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('refresh failures', () => {
        // Earlier imports of core leave interceptors on the shared axios instance.
        beforeEach(async () => {
            const { axios } = await import('../core');
            axios.interceptors.request.clear();
            axios.interceptors.response.clear();
            vi.resetModules();
            document.cookie = 'fractal_csrf_token=csrf-refresh-token; path=/';
        });

        const runExpiredRequest = async (refreshFailure) => {
            const core = await import('../core');
            const { axios, API_BASE, setAccessToken } = core;
            const calls = [];
            const expired = vi.fn();
            const originalAdapter = axios.defaults.adapter;
            window.addEventListener('auth:session_expired', expired);
            setAccessToken('stale-token');

            axios.defaults.adapter = async (config) => {
                calls.push(config);
                const error = new Error('request failed');
                error.config = config;
                if (String(config.url).includes('/auth/refresh')) {
                    Object.assign(error, refreshFailure);
                } else {
                    error.response = { status: 401, data: { error: 'Token expired' }, config };
                }
                throw error;
            };

            try {
                await expect(axios.get(`${API_BASE}/root-1/sessions`)).rejects.toBeTruthy();
                await expect(axios.get(`${API_BASE}/root-1/sessions`)).rejects.toBeTruthy();
            } finally {
                axios.defaults.adapter = originalAdapter;
                window.removeEventListener('auth:session_expired', expired);
            }
            return { calls, expired };
        };

        it('keeps the session when refresh fails because the network is down', async () => {
            const { calls, expired } = await runExpiredRequest({ code: 'ERR_NETWORK', message: 'Network Error' });

            expect(expired).not.toHaveBeenCalled();
            const sessionCalls = calls.filter((call) => String(call.url).includes('/sessions'));
            expect(sessionCalls.at(-1).headers?.Authorization).toBe('Bearer stale-token');
        });

        it('expires the session when the server rejects the refresh', async () => {
            const { expired } = await runExpiredRequest({ response: { status: 401, data: {} } });

            expect(expired).toHaveBeenCalledTimes(1);
        });
    });
