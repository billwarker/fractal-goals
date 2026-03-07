import { API_BASE, axios, buildQueryString } from './core';

export const fractalMetaApi = {
    getAnnotations: (rootId, visualizationType, context = {}) => {
        const params = new URLSearchParams();
        params.append('visualization_type', visualizationType);
        params.append('visualization_context', JSON.stringify(context));
        return axios.get(`${API_BASE}/roots/${rootId}/annotations?${params.toString()}`);
    },
    createAnnotation: (rootId, data) => axios.post(`${API_BASE}/roots/${rootId}/annotations`, data),
    deleteAnnotation: (rootId, annotationId) => axios.delete(`${API_BASE}/roots/${rootId}/annotations/${annotationId}`),
    getLogs: (rootId, options = {}) => axios.get(`${API_BASE}/${rootId}/logs${buildQueryString(options)}`),
    clearLogs: (rootId) => axios.delete(`${API_BASE}/${rootId}/logs/clear`),
};
