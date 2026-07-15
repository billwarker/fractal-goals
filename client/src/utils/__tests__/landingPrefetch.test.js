import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiState = vi.hoisted(() => ({ apiBase: '/api' }));

vi.mock('../api', () => ({
    get API_BASE() {
        return apiState.apiBase;
    },
    publicApi: {
        getLandingExamples: vi.fn().mockResolvedValue({ data: { examples: [] } }),
        getStaticLandingExamples: vi.fn().mockResolvedValue({ data: { examples: [] } }),
    },
}));

import { publicApi } from '../api';
import { getLandingPageHref, isLandingPreviewPath, isPublicLandingLocation, isPublicMarketingHost } from '../marketingHost';
import { fetchLandingExamples, maybePrefetchLandingExamples } from '../landingPrefetch';

describe('isPublicMarketingHost', () => {
    it('treats only the apex marketing domains as public hosts', () => {
        expect(isPublicMarketingHost('fractalgoals.com')).toBe(true);
        expect(isPublicMarketingHost('www.fractalgoals.com')).toBe(true);
        expect(isPublicMarketingHost('WWW.FRACTALGOALS.COM')).toBe(true);
        expect(isPublicMarketingHost('my.fractalgoals.com')).toBe(false);
        expect(isPublicMarketingHost('localhost')).toBe(false);
        expect(isPublicMarketingHost('127.0.0.1')).toBe(false);
        expect(isPublicMarketingHost('')).toBe(false);
        expect(isPublicMarketingHost('evil-fractalgoals.com')).toBe(false);
    });
});

describe('landing preview routing helpers', () => {
    it('allows the preview path only on local development hosts', () => {
        expect(isLandingPreviewPath('/landing-preview', 'localhost')).toBe(true);
        expect(isLandingPreviewPath('/landing-preview', '127.0.0.1')).toBe(true);
        expect(isLandingPreviewPath('/landing-preview', '::1')).toBe(true);
        expect(isLandingPreviewPath('/landing-preview', 'my.fractalgoals.com')).toBe(false);
        expect(isLandingPreviewPath('/landing', 'localhost')).toBe(false);
    });

    it('identifies only the production root and local preview as public landing locations', () => {
        expect(isPublicLandingLocation('/', 'fractalgoals.com')).toBe(true);
        expect(isPublicLandingLocation('/', 'www.fractalgoals.com')).toBe(true);
        expect(isPublicLandingLocation('/landing-preview', 'localhost')).toBe(true);
        expect(isPublicLandingLocation('/', 'my.fractalgoals.com')).toBe(false);
        expect(isPublicLandingLocation('/landing-preview', 'my.fractalgoals.com')).toBe(false);
    });

    it('links admins to local preview in dev and the apex site elsewhere', () => {
        expect(getLandingPageHref('localhost')).toBe('/landing-preview');
        expect(getLandingPageHref('my.fractalgoals.com')).toBe('https://fractalgoals.com/');
    });
});

describe('maybePrefetchLandingExamples', () => {
    const makeQueryClient = () => ({ prefetchQuery: vi.fn() });

    it('prefetches on the local preview path', () => {
        const queryClient = makeQueryClient();
        expect(maybePrefetchLandingExamples(queryClient, '/landing-preview')).toBe(true);
        expect(queryClient.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
            queryKey: ['public', 'landing-examples'],
        }));
    });

    it('does not prefetch on the deprecated /landing path', () => {
        const queryClient = makeQueryClient();
        expect(maybePrefetchLandingExamples(queryClient, '/landing')).toBe(false);
        expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
    });

    it('skips non-landing paths', () => {
        const queryClient = makeQueryClient();
        expect(maybePrefetchLandingExamples(queryClient, '/sessions')).toBe(false);
        expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
    });

    it('prefetches on the root path only for the marketing host', () => {
        const queryClient = makeQueryClient();
        // jsdom default hostname is localhost, which is not a marketing host.
        expect(maybePrefetchLandingExamples(queryClient, '/')).toBe(false);
        expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
    });
});

describe('fetchLandingExamples', () => {
    beforeEach(() => {
        apiState.apiBase = '/api';
        window.history.replaceState({}, '', '/');
        publicApi.getLandingExamples.mockClear();
        publicApi.getStaticLandingExamples.mockClear();
        vi.unstubAllGlobals();
        delete window.__fgLandingExamplesPreload;
        delete window.__fgLandingExamplesStaticUrl;
        delete window.__fgLandingExamplesStaticAttempted;
    });

    it('consumes the index.html preload promise once, then uses the API', async () => {
        window.__fgLandingExamplesPreload = Promise.resolve({ examples: [{ root_id: 'r1' }] });

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [{ root_id: 'r1' }] });
        expect(window.__fgLandingExamplesPreload).toBeUndefined();
        expect(publicApi.getLandingExamples).not.toHaveBeenCalled();

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('falls back to the API when the preload rejected', async () => {
        window.__fgLandingExamplesPreload = Promise.reject(new Error('preload failed'));
        window.__fgLandingExamplesPreload.catch(() => {});

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(window.__fgLandingExamplesPreload).toBeUndefined();
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('does not retry the static origin after the inline preload already attempted it', async () => {
        window.__fgLandingExamplesStaticUrl = 'https://storage.example/landing-examples.json';
        window.__fgLandingExamplesStaticAttempted = true;
        window.__fgLandingExamplesPreload = Promise.reject(new DOMException('timed out', 'AbortError'));
        window.__fgLandingExamplesPreload.catch(() => {});

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getStaticLandingExamples).not.toHaveBeenCalled();
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('ignores the preload when the app is not calling same-origin /api', async () => {
        apiState.apiBase = 'http://localhost:8001/api';
        window.__fgLandingExamplesPreload = Promise.resolve({ examples: [{ root_id: 'r1' }] });

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
        expect(window.__fgLandingExamplesPreload).toBeDefined();
    });

    it('uses the API when no preload promise exists', async () => {
        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('uses the local API for landing preview even when a production static URL is present', async () => {
        window.history.replaceState({}, '', '/landing-preview');
        window.__fgLandingExamplesStaticUrl = 'https://storage.example/landing-examples.json';

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getStaticLandingExamples).not.toHaveBeenCalled();
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('uses the configured static snapshot before the API', async () => {
        window.__fgLandingExamplesStaticUrl = '/landing-examples.json';
        publicApi.getStaticLandingExamples.mockResolvedValueOnce({ data: { examples: [{ root_id: 'static-root' }] } });

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [{ root_id: 'static-root' }] });
        expect(publicApi.getStaticLandingExamples).toHaveBeenCalledWith('/landing-examples.json');
        expect(publicApi.getLandingExamples).not.toHaveBeenCalled();
    });

    it('falls back to the API when the static snapshot is unavailable', async () => {
        window.__fgLandingExamplesStaticUrl = '/landing-examples.json';
        publicApi.getStaticLandingExamples.mockRejectedValueOnce(new Error('static snapshot unavailable'));

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed static snapshot and falls back to the API', async () => {
        window.__fgLandingExamplesStaticUrl = '/landing-examples.json';
        publicApi.getStaticLandingExamples.mockResolvedValueOnce({ data: { examples: 'not-an-array' } });

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });

    it('rejects a current-schema static snapshot without its publication revision', async () => {
        window.__fgLandingExamplesStaticUrl = '/landing-examples.json';
        publicApi.getStaticLandingExamples.mockResolvedValueOnce({
            data: { schema_version: 12, examples: [{ root_id: 'root', tree: {} }] },
        });

        await expect(fetchLandingExamples()).resolves.toEqual({ examples: [] });
        expect(publicApi.getLandingExamples).toHaveBeenCalledTimes(1);
    });
});
