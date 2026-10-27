import { API_BASE, axios } from './core';

export const storageApi = {
    connections: () => axios.get(`${API_BASE}/storage/connections`),
    connect: (provider) => axios.post(`${API_BASE}/storage/${provider}/connect`),
    disconnect: (provider) => axios.delete(`${API_BASE}/storage/${provider}/connection`),
    setUploadDestination: (provider) => axios.put(`${API_BASE}/storage/upload-destination`, { provider }),
    picker: () => axios.post(`${API_BASE}/storage/google_drive/picker`),
    dropboxFiles: (cursor = null) => axios.post(`${API_BASE}/storage/dropbox/files`, { cursor }),
    importFile: (rootId, provider, fileId, resourceKey) => axios.post(`${API_BASE}/${rootId}/media`, {
        provider, file_id: fileId, ...(resourceKey ? { resource_key: resourceKey } : {}),
    }),
    startUpload: (rootId, provider, file) => axios.post(`${API_BASE}/${rootId}/media/uploads`, {
        provider, name: file.name, mime_type: file.type, size_bytes: file.size,
    }),
    uploadChunk: (rootId, uploadId, offset, blob, signal) => axios.put(
        `${API_BASE}/${rootId}/media/uploads/${uploadId}`, blob,
        { headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) }, signal },
    ),
    cancelUpload: (rootId, uploadId) => axios.delete(`${API_BASE}/${rootId}/media/uploads/${uploadId}`),
    renameMedia: (rootId, assetId, name) => axios.patch(`${API_BASE}/${rootId}/media/${assetId}`, { name }),
    mediaUsage: (rootId, assetId) => axios.get(`${API_BASE}/${rootId}/media/${assetId}/usage`),
    deleteMedia: (rootId, assetId) => axios.delete(`${API_BASE}/${rootId}/media/${assetId}`),
    goalAttachments: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/attachments`),
};

/** Opens the original in Google Drive or Dropbox (the server redirects after checking ownership). */
export function mediaOpenUrl(rootId, assetId) {
    return `${API_BASE}/${encodeURIComponent(rootId)}/media/${encodeURIComponent(assetId)}/open`;
}

/** The provider's preview image for a file, used as a video's poster frame. */
export function mediaThumbnailUrl(rootId, assetId) {
    return `${API_BASE}/${encodeURIComponent(rootId)}/media/${encodeURIComponent(assetId)}/thumbnail`;
}

export function mediaContentUrl(rootId, assetId) {
    return `${API_BASE}/${encodeURIComponent(rootId)}/media/${encodeURIComponent(assetId)}/content`;
}
