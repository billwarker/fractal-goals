import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('api core auth refresh behavior', () => {
    beforeEach(() => {
        vi.resetModules();
        document.cookie = 'fractal_csrf_token=csrf-refresh-token; path=/';
    });

    afterEach(() => {
        document.cookie = 'fractal_csrf_token=; Max-Age=0; path=/';
    });

    it('adds an existing CSRF cookie to refresh without fetching a new CSRF token', async () => {
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            return {
                data: { token: 'token-a', user: { id: 'user-a' } },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            await axios.post(`${API_BASE}/auth/refresh`, {}, { _skipCsrfFetch: true });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/auth/refresh');
        expect(calls[0].headers?.['X-CSRF-Token']).toBe('csrf-refresh-token');
        expect(calls.some((call) => String(call.url).includes('/auth/csrf'))).toBe(false);
    });

    it('rejects CSRF auth failures without attempting refresh', async () => {
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            const error = new Error('Unauthorized');
            error.config = config;
            error.response = { status: 401, data: { error: 'Unauthorized' }, config };
            throw error;
        };

        try {
            await expect(axios.get(`${API_BASE}/auth/csrf`)).rejects.toMatchObject({
                response: { status: 401 },
            });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/auth/csrf');
        expect(calls.some((call) => String(call.url).includes('/auth/refresh'))).toBe(false);
    });
});
