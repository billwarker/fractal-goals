import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('api core retry after token refresh', () => {
    // Earlier imports of core leave interceptors on the shared axios instance.
    beforeEach(async () => {
        const { axios } = await import('../core');
        axios.interceptors.request.clear();
        axios.interceptors.response.clear();
        vi.resetModules();
    });

    it('retries with the refreshed token, not the expired one', async () => {
        const { axios, API_BASE, getAuthGeneration, setAccessToken } = await import('../core');
        const originalAdapter = axios.defaults.adapter;
        const sent = [];
        setAccessToken('stale-token');
        const generationBefore = getAuthGeneration();

        axios.defaults.adapter = async (config) => {
            const auth = config.headers?.Authorization;
            sent.push([String(config.url).replace(API_BASE, ''), auth]);
            if (String(config.url).includes('/auth/refresh')) {
                return { data: { token: 'fresh-token' }, status: 200, statusText: 'OK', headers: {}, config };
            }
            if (auth === 'Bearer fresh-token') {
                return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
            }
            const error = new Error('Unauthorized');
            error.config = config;
            error.response = { status: 401, data: { error: 'Token expired' }, config };
            throw error;
        };

        try {
            const response = await axios.post(`${API_BASE}/root/sessions/session/pause`, {});
            expect(response.data).toEqual({ ok: true });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(sent.at(-1)).toEqual(['/root/sessions/session/pause', 'Bearer fresh-token']);
        expect(getAuthGeneration()).toBe(generationBefore + 1);
    });
});
