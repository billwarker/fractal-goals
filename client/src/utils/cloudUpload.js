import { storageApi } from './api/storageApi';

// Canonical type → kind, extensions and the other names browsers and providers use for it.
// Mirrors MEDIA_TYPES in services/storage_common.py; both are checked against tests/fixtures/media_types.json.
export const UPLOAD_TYPES = {
    'image/jpeg': { kind: 'image', extensions: ['.jpg', '.jpeg'], aliases: [] },
    'image/png': { kind: 'image', extensions: ['.png'], aliases: [] },
    'image/webp': { kind: 'image', extensions: ['.webp'], aliases: [] },
    'image/gif': { kind: 'image', extensions: ['.gif'], aliases: [] },
    'video/mp4': { kind: 'video', extensions: ['.mp4'], aliases: [] },
    'video/webm': { kind: 'video', extensions: ['.webm'], aliases: [] },
    'audio/mpeg': { kind: 'audio', extensions: ['.mp3'], aliases: ['audio/mp3'] },
    'audio/mp4': { kind: 'audio', extensions: ['.m4a'], aliases: ['audio/x-m4a', 'audio/m4a', 'audio/mp4a-latm', 'audio/aac'] },
    'audio/wav': { kind: 'audio', extensions: ['.wav'], aliases: ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'] },
    'audio/flac': { kind: 'audio', extensions: ['.flac'], aliases: ['audio/x-flac'] },
    'audio/ogg': { kind: 'audio', extensions: ['.ogg', '.opus'], aliases: ['audio/opus', 'audio/x-opus+ogg', 'application/ogg'] },
};
const ALL_SPECS = Object.entries(UPLOAD_TYPES);
/** Every type name a provider may label an accepted file with (for pickers that filter by type). */
export const UPLOAD_MIME_NAMES = ALL_SPECS.flatMap(([type, spec]) => [type, ...spec.aliases]);
// Extensions too: some systems grey out `.flac` or `.opus` files when only types are listed.
export const UPLOAD_ACCEPT = [...UPLOAD_MIME_NAMES, ...ALL_SPECS.flatMap(([, spec]) => spec.extensions)].join(',');
export const SUPPORTED_TYPES_TEXT = 'a picture (JPEG, PNG, WebP, GIF), video (MP4, WebM) or audio (MP3, M4A, WAV, FLAC, OGG) file';

/**
 * The canonical type for a file whose extension matches it, or null. Aliases (`audio/x-m4a`)
 * resolve to their canonical type; a blank or generic type falls back to the extension.
 */
export function canonicalMediaType(type, name = '') {
    const mime = String(type || '').trim().toLowerCase();
    const lowered = String(name || '').toLowerCase();
    const match = ALL_SPECS.find(([canonical, spec]) => spec.extensions.some((extension) => lowered.endsWith(extension))
        && (!mime || mime === 'application/octet-stream' || mime === canonical || spec.aliases.includes(mime)));
    return match ? match[0] : null;
}

/** 'image' | 'video' | 'audio' for a canonical type, else null. */
export function mediaKind(type) {
    return UPLOAD_TYPES[type]?.kind || null;
}

/** The file relabelled with its canonical type, so uploads and the server agree on what it is. */
export function withCanonicalType(file) {
    const canonical = canonicalMediaType(file.type, file.name);
    return !canonical || canonical === file.type ? file : new File([file], file.name, { type: canonical, lastModified: file.lastModified });
}

/** Returns a reason the server would reject this file, or null. */
export function uploadProblem(file, maxBytes) {
    if (!canonicalMediaType(file.type, file.name)) {
        return `${file.name || 'This file'} isn’t ${SUPPORTED_TYPES_TEXT}.`;
    }
    if (maxBytes && file.size > maxBytes) {
        return `${file.name} is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
    }
    if (!file.size) return `${file.name} is empty.`;
    return null;
}

/** Clipboard images arrive as "image.png" or unnamed; give each a distinct, dated name. */
export function namePastedFile(file, index = 0, now = new Date()) {
    const type = UPLOAD_TYPES[file.type] ? file.type : ALL_SPECS.find(([, spec]) => spec.aliases.includes(file.type))?.[0];
    if (!type) return file;
    const extension = UPLOAD_TYPES[type].extensions[0];
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
    return new File([file], `Pasted ${mediaKind(type)} ${stamp}${index ? ` (${index + 1})` : ''}${extension}`, { type });
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
