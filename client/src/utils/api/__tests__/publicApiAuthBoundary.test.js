import { afterEach, describe, expect, it, vi } from 'vitest';

describe('public API auth boundary', () => {
    afterEach(() => {
        vi.resetModules();
    });

    it('never attaches an access token to public API requests', async () => {
        const { axios, API_BASE, clearAccessToken, setAccessToken } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;
        setAccessToken('private-token');
        axios.defaults.adapter = async (config) => {
            calls.push(config);
            return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
        };

        try {
            await axios.get(`${API_BASE}/public/landing-examples`);
        } finally {
            clearAccessToken();
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].headers?.Authorization).toBeUndefined();
    });
});
