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

    it('never attaches an access token to the external static snapshot', async () => {
        const { axios, clearAccessToken, setAccessToken } = await import('../core');
        const { publicApi } = await import('../publicApi');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;
        setAccessToken('private-token');
        axios.defaults.adapter = async (config) => {
            calls.push(config);
            return { data: { examples: [] }, status: 200, statusText: 'OK', headers: {}, config };
        };

        try {
            await publicApi.getStaticLandingExamples('https://storage.googleapis.com/example/landing-examples.json');
        } finally {
            clearAccessToken();
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].headers?.Authorization).toBeUndefined();
        expect(calls[0].withCredentials).toBe(false);
        expect(calls[0].timeout).toBe(2000);
    });
});
