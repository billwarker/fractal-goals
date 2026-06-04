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

    it('shares one CSRF fetch across concurrent mutating requests', async () => {
        document.cookie = 'fractal_csrf_token=; Max-Age=0; path=/';
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            if (String(config.url).includes('/auth/csrf')) {
                document.cookie = 'fractal_csrf_token=shared-token; path=/';
                return {
                    data: {},
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-csrf-token': 'shared-token' },
                    config,
                };
            }
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            await Promise.all([
                axios.post(`${API_BASE}/root/sessions/session/activities`, {}),
                axios.delete(`${API_BASE}/root/sessions/session/activities/instance`),
            ]);
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.filter((call) => String(call.url).includes('/auth/csrf'))).toHaveLength(1);
        const mutatingCalls = calls.filter((call) => !String(call.url).includes('/auth/csrf'));
        expect(mutatingCalls).toHaveLength(2);
        expect(mutatingCalls.every((call) => call.headers?.['X-CSRF-Token'] === 'shared-token')).toBe(true);
    });

    it('refreshes and retries once after a CSRF 403', async () => {
        document.cookie = 'fractal_csrf_token=stale-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push({
                url: config.url,
                headers: { ...(config.headers || {}) },
            });
            if (String(config.url).includes('/auth/csrf')) {
                document.cookie = 'fractal_csrf_token=fresh-token; path=/';
                return {
                    data: {},
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-csrf-token': 'fresh-token' },
                    config,
                };
            }
            if (config.headers?.['X-CSRF-Token'] === 'stale-token') {
                const error = new Error('Forbidden');
                error.config = config;
                error.response = { status: 403, data: { error: 'CSRF token missing or invalid' }, config };
                throw error;
            }
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            const response = await axios.post(`${API_BASE}/root/sessions/session/activities`, {});
            expect(response.data).toEqual({ ok: true });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.map((call) => call.headers?.['X-CSRF-Token'])).toEqual([
            'stale-token',
            undefined,
            'fresh-token',
        ]);
    });
});
