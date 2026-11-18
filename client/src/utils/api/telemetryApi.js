import { API_BASE, axios } from './core';

// `keepalive` sends through fetch so the request survives the page closing (pagehide);
// the auth and CSRF interceptors apply to it as to any other request.
const keepaliveConfig = (keepalive) => (keepalive ? { adapter: 'fetch', fetchOptions: { keepalive: true } } : undefined);

export const telemetryApi = {
    recordEvents: (data, { keepalive = false } = {}) => axios.post(
        `${API_BASE}/telemetry/events`, data, keepaliveConfig(keepalive),
    ),
};
