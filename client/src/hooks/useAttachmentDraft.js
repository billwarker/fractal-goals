import { useCallback, useEffect, useRef, useState } from 'react';

import { storageApi } from '../utils/api/storageApi';
import { namePastedFile, runCloudUpload, uploadProblem } from '../utils/cloudUpload';
import { providerLabel } from '../utils/storageConnectionCopy';
import { useStorageConnections } from './useStorageConnections';

const MAX_ATTACHMENTS = 8;
const errorText = (error) => error?.response?.data?.error || error?.message || 'The upload failed. Retry to resume.';
let nextKey = 0;

const DRAFT_FIELDS = ['key', 'status', 'file', 'session', 'progress', 'error'];
/** A finished draft item in the server's serialized attachment shape. */
function serializedAttachment(item) {
    const asset = { ...item };
    DRAFT_FIELDS.forEach((field) => { delete asset[field]; });
    return { ...asset, id: asset.asset_id, alt_text: asset.alt_text || '' };
}

const readyItem = (asset) => ({ ...asset, asset_id: asset.asset_id || asset.id, key: asset.asset_id || asset.id, status: 'ready' });

/**
 * Draft attachments for one note: chosen cloud files plus local files and pasted images being
 * uploaded into the user's connected storage. Only finished uploads reach the note payload.
 */
export function useAttachmentDraft(rootId, initial = []) {
    const { providers, limits, uploadDestination, invalidateAttachments } = useStorageConnections();
    const [items, setItems] = useState(() => initial.map(readyItem));
    const [notice, setNotice] = useState('');
    const uploads = useRef(new Map());
    // Settings → Cloud Storage chooses this when more than one account is connected.
    const destination = uploadDestination || providers.find((item) => item.connected)?.provider || null;

    const update = useCallback((key, changes) => setItems((current) => (
        current.map((item) => (item.key === key ? { ...item, ...changes } : item))
    )), []);

    useEffect(() => () => uploads.current.forEach((controller) => controller.abort()), []);

    const upload = useCallback(async (key, file, provider, session = null) => {
        const controller = new AbortController();
        uploads.current.set(key, controller);
        update(key, { status: 'uploading', error: '' });
        try {
            const asset = await runCloudUpload({
                rootId, provider, file, session, signal: controller.signal,
                onProgress: (progress) => update(key, { session: progress, progress: progress.offset / progress.size_bytes }),
            });
            update(key, { ...readyItem(asset), key, alt_text: '' });
        } catch (failure) {
            if (!controller.signal.aborted) update(key, { status: 'failed', error: errorText(failure), session: failure.session || session });
        } finally {
            uploads.current.delete(key);
        }
    }, [rootId, update]);

    /** Queue local files for upload. Returns the number accepted. */
    const addFiles = useCallback((files, { pasted = false } = {}) => {
        const list = Array.from(files || []);
        if (!list.length) return 0;
        setNotice('');
        if (!rootId) return 0;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setNotice('Pictures and video need an internet connection.');
            return 0;
        }
        if (!destination) {
            setNotice(providers.some((item) => item.configured)
                ? 'Connect Google Drive or Dropbox in Settings → Cloud Storage to save pictures from this device.'
                : 'Cloud storage isn’t available yet. You can still paste shared links into your note.');
            return 0;
        }
        const room = MAX_ATTACHMENTS - items.length;
        const problems = [];
        const accepted = [];
        list.forEach((original, index) => {
            const file = pasted ? namePastedFile(original, index) : original;
            const problem = uploadProblem(file, limits?.max_file_bytes);
            if (problem) problems.push(problem);
            else if (accepted.length < room) accepted.push(file);
        });
        if (list.length - problems.length > room) problems.push(`A note can have up to ${MAX_ATTACHMENTS} attachments.`);
        if (problems.length) setNotice(problems.join(' '));
        const queued = accepted.map((file) => ({
            key: `upload-${++nextKey}`, name: file.name, status: 'uploading', progress: 0, file, provider: destination,
        }));
        setItems((current) => [...current, ...queued]);
        queued.forEach((item) => { void upload(item.key, item.file, item.provider); });
        return queued.length;
    }, [rootId, destination, providers, limits, items.length, upload]);

    /** Paste handler for a textarea: uploads clipboard images and leaves text paste alone. */
    const handlePaste = useCallback((event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        addFiles(files, { pasted: true });
        return true;
    }, [addFiles]);

    const dropProps = {
        onDragOver: (event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); },
        onDrop: (event) => {
            if (!event.dataTransfer?.files?.length) return;
            event.preventDefault();
            addFiles(event.dataTransfer.files);
        },
    };

    const remove = useCallback((key) => {
        const item = items.find((entry) => entry.key === key);
        uploads.current.get(key)?.abort();
        // Unfinished provider sessions expire on their own; files already saved stay in the user's storage.
        if (item?.session?.id && !item.asset_id) {
            void Promise.resolve().then(() => storageApi.cancelUpload(rootId, item.session.id)).catch(() => {});
        }
        setItems((current) => current.filter((entry) => entry.key !== key));
    }, [items, rootId]);

    const retry = useCallback((key) => {
        const item = items.find((entry) => entry.key === key);
        if (item?.file) void upload(key, item.file, item.provider, item.session);
    }, [items, upload]);

    const addAsset = useCallback((asset) => {
        setItems((current) => (
            current.some((item) => item.asset_id === (asset.asset_id || asset.id)) || current.length >= MAX_ATTACHMENTS
                ? current : [...current, readyItem(asset)]
        ));
    }, []);

    /** Rename the original in the user's storage. Every note showing it picks up the new name. */
    const renameFile = useCallback(async (key, name) => {
        const item = items.find((entry) => entry.key === key);
        const renamed = (await storageApi.renameMedia(rootId, item.asset_id, name)).data;
        update(key, { name: renamed.name });
        invalidateAttachments?.();
        return renamed;
    }, [items, rootId, update, invalidateAttachments]);

    const fileUsage = useCallback(async (key) => {
        const item = items.find((entry) => entry.key === key);
        return (await storageApi.mediaUsage(rootId, item.asset_id)).data;
    }, [items, rootId]);

    /** Move the original to the provider's trash; it leaves this draft and every saved note. */
    const deleteFile = useCallback(async (key) => {
        const item = items.find((entry) => entry.key === key);
        await storageApi.deleteMedia(rootId, item.asset_id);
        setItems((current) => current.filter((entry) => entry.key !== key));
        invalidateAttachments?.();
    }, [items, rootId, invalidateAttachments]);

    const reset = useCallback((next = []) => {
        uploads.current.forEach((controller) => controller.abort());
        setItems(next.map(readyItem));
        setNotice('');
    }, []);

    const isUploading = items.some((item) => item.status === 'uploading');
    const hasFailed = items.some((item) => item.status === 'failed');
    return {
        rootId, items, notice, clearNotice: () => setNotice(''),
        destinationLabel: destination ? providerLabel(destination) : null,
        canAdd: items.length < MAX_ATTACHMENTS, isUploading, hasFailed, isBusy: isUploading || hasFailed,
        busyReason: isUploading ? 'Waiting for uploads to finish' : hasFailed ? 'Retry or remove the failed upload' : '',
        addFiles, addAsset, handlePaste, dropProps, remove, retry, reset, renameFile, fileUsage, deleteFile,
        /** Finished attachments in the server's serialized shape, for optimistic note rendering. */
        attachments: () => items.filter((item) => item.status === 'ready').map(serializedAttachment),
        payload: () => items.filter((item) => item.status === 'ready').map((item) => ({ asset_id: item.asset_id, alt_text: item.alt_text || '' })),
    };
}
