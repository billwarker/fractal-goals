import { describe, expect, it } from 'vitest';

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
