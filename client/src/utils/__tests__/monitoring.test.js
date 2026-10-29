import { describe, expect, it, vi } from 'vitest';

import { privateStorageRecord, scrubStorageTelemetry } from '../monitoring';

describe('storage telemetry privacy', () => {
    it.each([
        { data: { url: 'https://docs.google.com/picker?oauth_token=private' } },
        { data: { 'http.url': 'https://content.dropboxapi.com/2/files/download' } },
        { description: 'PUT https://www.googleapis.com/upload/drive/v3/files?upload_id=private' },
        { data: { url: '/api/root/media/asset/content' } },
    ])('excludes provider capabilities from browser breadcrumbs and tracing: %j', (record) => {
        expect(privateStorageRecord(record)).toBe(true);
    });

    it('retains unrelated diagnostics while removing storage spans and breadcrumbs', () => {
        const safe = { data: { url: '/api/root/notes' } };
        const sensitive = { data: { url: '/api/storage/google_drive/picker' } };
        expect(scrubStorageTelemetry({ breadcrumbs: [safe, sensitive], spans: [sensitive, safe] }))
            .toEqual({ breadcrumbs: [safe], spans: [safe] });
        expect(scrubStorageTelemetry({ request: { url: '/api/storage/google_drive/callback?code=secret' } })).toBeNull();
    });
});

describe('session replay compression worker', () => {
    it('passes a same-origin worker URL so the CSP worker-src self policy holds', async () => {
        const replayIntegration = vi.fn((options) => ({ name: 'Replay', options }));
        const init = vi.fn();
        vi.doMock('@sentry/react', () => ({
            init,
            replayIntegration,
            browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
        }));
        const { initializeMonitoring, REPLAY_WORKER_URL } = await import('../monitoring');

        await initializeMonitoring('https://key@sentry.invalid/1');

        expect(replayIntegration).toHaveBeenCalledWith(expect.objectContaining({ workerUrl: REPLAY_WORKER_URL }));
        const workerUrl = new URL(REPLAY_WORKER_URL, window.location.origin);
        expect(workerUrl.origin).toBe(window.location.origin);
        expect(workerUrl.protocol).not.toBe('blob:');
        vi.doUnmock('@sentry/react');
    });
});
