import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAttachmentDraft } from '../useAttachmentDraft';

const mocks = vi.hoisted(() => ({ api: { startUpload: vi.fn(), uploadChunk: vi.fn(), cancelUpload: vi.fn() }, storage: {} }));
vi.mock('../../utils/api/storageApi', () => ({ storageApi: mocks.api }));
vi.mock('../useStorageConnections', () => ({ useStorageConnections: () => mocks.storage }));

const connected = (provider) => ({ provider, configured: true, connected: true, status: 'active' });
const file = (name = 'photo.jpg', type = 'image/jpeg', size = 4) => new File([new Uint8Array(size)], name, { type });
const session = { id: 'upload', offset: 0, chunk_bytes: 1048576, size_bytes: 4 };
const done = { data: { id: 'upload', offset: 4, size_bytes: 4, asset: { id: 'asset', name: 'photo.jpg' } } };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage = { providers: [connected('dropbox')], limits: { max_file_bytes: 10, max_attachments: 8 } };
    mocks.api.startUpload.mockResolvedValue({ data: session });
});

describe('useAttachmentDraft', () => {
    it('uploads into the first connected provider and exposes only finished files', async () => {
        mocks.api.uploadChunk.mockResolvedValue(done);
        const { result } = renderHook(() => useAttachmentDraft('root'));
        act(() => { result.current.addFiles([file()]); });
        expect(result.current.isBusy).toBe(true);
        expect(result.current.payload()).toEqual([]);
        await waitFor(() => expect(result.current.isUploading).toBe(false));
        expect(mocks.api.startUpload).toHaveBeenCalledWith('root', 'dropbox', expect.any(File));
        expect(result.current.payload()).toEqual([{ asset_id: 'asset', alt_text: '' }]);
        expect(result.current.destinationLabel).toBe('Dropbox');
    });

    it('resumes a failed upload without starting a second provider file', async () => {
        mocks.api.uploadChunk.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(done);
        const { result } = renderHook(() => useAttachmentDraft('root'));
        act(() => { result.current.addFiles([file()]); });
        await waitFor(() => expect(result.current.hasFailed).toBe(true));
        act(() => result.current.retry(result.current.items[0].key));
        await waitFor(() => expect(result.current.payload()).toHaveLength(1));
        expect(mocks.api.startUpload).toHaveBeenCalledTimes(1);
    });

    it('explains unsupported, oversized and unconnected uploads without queueing them', () => {
        const { result, rerender } = renderHook(() => useAttachmentDraft('root'));
        act(() => { result.current.addFiles([file('scan.heic', 'image/heic'), file('huge.jpg', 'image/jpeg', 11)]); });
        expect(result.current.items).toEqual([]);
        expect(result.current.notice).toMatch(/scan.heic isn’t a picture \(JPEG.*or audio \(MP3.*huge.jpg is larger/);
        mocks.storage = { providers: [{ provider: 'dropbox', configured: true, connected: false, status: 'not_connected' }], limits: null };
        rerender();
        act(() => { result.current.addFiles([file()]); });
        expect(result.current.notice).toMatch(/Connect Google Drive or Dropbox in Settings/);
        expect(mocks.api.startUpload).not.toHaveBeenCalled();
    });

    it('uploads audio under its canonical type, whatever the browser called it', async () => {
        mocks.api.uploadChunk.mockResolvedValue(done);
        const { result } = renderHook(() => useAttachmentDraft('root'));
        // macOS reports Voice Memos as audio/x-m4a; some browsers leave FLAC untyped.
        act(() => { result.current.addFiles([file('Verse idea.m4a', 'audio/x-m4a'), file('Mix.flac', '')]); });
        expect(result.current.notice).toBe('');
        await waitFor(() => expect(mocks.api.startUpload).toHaveBeenCalledTimes(2));
        const sent = mocks.api.startUpload.mock.calls.map(([, , upload]) => [upload.name, upload.type]);
        expect(sent).toEqual([['Verse idea.m4a', 'audio/mp4'], ['Mix.flac', 'audio/flac']]);
    });

    it('names pasted pictures and ignores text pastes', () => {
        mocks.api.uploadChunk.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useAttachmentDraft('root'));
        const textPaste = { clipboardData: { files: [] }, preventDefault: vi.fn() };
        expect(result.current.handlePaste(textPaste)).toBe(false);
        expect(textPaste.preventDefault).not.toHaveBeenCalled();
        const imagePaste = { clipboardData: { files: [file('image.png', 'image/png'), file('image.png', 'image/png')] }, preventDefault: vi.fn() };
        act(() => { result.current.handlePaste(imagePaste); });
        expect(imagePaste.preventDefault).toHaveBeenCalled();
        const names = result.current.items.map((item) => item.name);
        expect(names[0]).toMatch(/^Pasted image .+\.png$/);
        expect(names[1]).toMatch(/\(2\)\.png$/);
    });

    it('caps a note at eight attachments', () => {
        mocks.api.uploadChunk.mockReturnValue(new Promise(() => {}));
        const initial = Array.from({ length: 7 }, (_, index) => ({ id: `asset-${index}`, name: `${index}.jpg` }));
        const { result } = renderHook(() => useAttachmentDraft('root', initial));
        act(() => { result.current.addFiles([file('a.jpg'), file('b.jpg')]); });
        expect(result.current.items).toHaveLength(8);
        expect(result.current.notice).toMatch(/up to 8 attachments/);
        expect(result.current.canAdd).toBe(false);
    });
});
