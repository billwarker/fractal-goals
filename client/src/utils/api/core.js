import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

axios.defaults.withCredentials = true;
axios.defaults.timeout = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000);

let accessToken = null;
let isRefreshing = false;
let isFetchingCsrf = false;
let failedQueue = [];
const CSRF_COOKIE_NAME = 'fractal_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const setAccessToken = (token) => {
    accessToken = token || null;
};

export const clearAccessToken = () => {
    accessToken = null;
};

const processQueue = (error, token = null) => {
    failedQueue.forEach((pending) => {
        if (error) {
            pending.reject(error);
        } else {
            pending.resolve(token);
        }
    });
    failedQueue = [];
};

const readCookie = (name) => {
    if (typeof document === 'undefined' || !document.cookie) return null;
    return document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1) || null;
};

const needsCsrfHeader = (config) => {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    if (!MUTATING_METHODS.has(method)) return false;
    if (config.headers?.Authorization || accessToken) return false;
    if (url.includes('/auth/login') || url.includes('/auth/signup') || url.includes('/auth/refresh')) return false;
    return true;
};

const ensureCsrfToken = async (config) => {
    let token = readCookie(CSRF_COOKIE_NAME);
    if (token || config._skipCsrfFetch || isFetchingCsrf) return token;

    isFetchingCsrf = true;
    try {
        const response = await axios.get(`${API_BASE}/auth/csrf`, { _skipCsrfFetch: true });
        token = readCookie(CSRF_COOKIE_NAME) || response.headers?.[CSRF_HEADER_NAME.toLowerCase()] || null;
    } finally {
        isFetchingCsrf = false;
    }
    return token;
};

axios.interceptors.request.use(async (config) => {
    if (accessToken && !config.headers?.Authorization) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    if (String(config.url || '').includes('/auth/refresh') && !config.headers?.[CSRF_HEADER_NAME]) {
        const csrfToken = readCookie(CSRF_COOKIE_NAME);
        if (csrfToken) {
            config.headers = config.headers || {};
            config.headers[CSRF_HEADER_NAME] = decodeURIComponent(csrfToken);
        }
    }
    if (needsCsrfHeader(config)) {
        const csrfToken = await ensureCsrfToken(config);
        if (csrfToken) {
            config.headers = config.headers || {};
            config.headers[CSRF_HEADER_NAME] = decodeURIComponent(csrfToken);
        }
    }
    if (typeof window !== 'undefined') {
        const pageParams = new URLSearchParams(window.location.search || '');
        const adminUserId = pageParams.get('admin_user_id');
        const adminMode = pageParams.get('admin_mode');
        const url = String(config.url || '');
        if (
            adminUserId
            && adminMode
            && url.includes('/api/')
            && !url.includes('/api/admin/')
            && !url.includes('/api/auth/')
        ) {
            config.params = {
                ...(config.params || {}),
                admin_user_id: adminUserId,
                admin_mode: adminMode,
            };
        }
    }
    return config;
});

axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest?._retry) {
            if (
                originalRequest?.url?.includes('/auth/refresh') ||
                originalRequest?.url?.includes('/auth/login') ||
                originalRequest?.url?.includes('/auth/me') ||
                originalRequest?.url?.includes('/auth/csrf')
            ) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    if (token) {
                        originalRequest.headers = originalRequest.headers || {};
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                    }
                    return axios(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const response = await axios.post(`${API_BASE}/auth/refresh`, {}, { _skipCsrfFetch: true });

                const { token, user } = response.data;
                setAccessToken(token);
                window.dispatchEvent(new CustomEvent('auth:token_refreshed', { detail: { token, user } }));

                processQueue(null, token);

                if (!originalRequest.headers?.[CSRF_HEADER_NAME] && needsCsrfHeader(originalRequest)) {
                    const csrfToken = await ensureCsrfToken(originalRequest);
                    if (csrfToken) {
                        originalRequest.headers = originalRequest.headers || {};
                        originalRequest.headers[CSRF_HEADER_NAME] = decodeURIComponent(csrfToken);
                    }
                }

                return axios(originalRequest);
            } catch (refreshError) {
                clearAccessToken();
                processQueue(refreshError, null);
                window.dispatchEvent(new Event('auth:unauthorized'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export function buildQueryString(options = {}, mappings = {}) {
    const params = new URLSearchParams();

    Object.entries(options).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            return;
        }
        const paramKey = mappings[key] || key;
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item === undefined || item === null || item === '') return;
                params.append(paramKey, item);
            });
            return;
        }
        params.append(paramKey, value);
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

export { axios };
