import { storageApi } from './api/storageApi';

// Mirrors MEDIA_TYPES in services/storage_common.py.
export const UPLOAD_TYPES = {
    'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/gif': ['.gif'],
    'video/mp4': ['.mp4'], 'video/webm': ['.webm'],
};
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).join(',');

/** Returns a reason the server would reject this file, or null. */
export function uploadProblem(file, maxBytes) {
    const extensions = UPLOAD_TYPES[file.type];
    if (!extensions || !extensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
        return `${file.name || 'This file'} isn’t a JPEG, PNG, WebP, GIF, MP4 or WebM file.`;
    }
    if (maxBytes && file.size > maxBytes) {
        return `${file.name} is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
    }
    if (!file.size) return `${file.name} is empty.`;
    return null;
}

/** Clipboard images arrive as "image.png" or unnamed; give each a distinct, dated name. */
export function namePastedFile(file, index = 0, now = new Date()) {
    const extension = UPLOAD_TYPES[file.type]?.[0];
    if (!extension) return file;
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    return new File([file], `Pasted ${kind} ${stamp}${index ? ` (${index + 1})` : ''}${extension}`, { type: file.type });
}

/**
 * Upload a local file into the user's connected storage in confirmed chunks.
 * Pass the `session` from a previous failure to resume instead of creating a second provider file.
 */
export async function runCloudUpload({ rootId, provider, file, session = null, signal, onProgress }) {
    let current = session || (await storageApi.startUpload(rootId, provider, file)).data;
    onProgress?.(current);
    while (!current.asset) {
        if (signal?.aborted) throw Object.assign(new Error('Upload cancelled.'), { session: current, cancelled: true });
        let next;
        try {
            next = (await storageApi.uploadChunk(rootId, current.id, current.offset,
                file.slice(current.offset, current.offset + current.chunk_bytes), signal)).data;
        } catch (failure) {
            throw Object.assign(failure, { session: current });
        }
        if (!next.asset && next.offset <= current.offset) {
            throw Object.assign(new Error('Upload made no progress. Retry to resume.'), { session: current });
        }
        current = next;
        onProgress?.(current);
    }
    return current.asset;
}
