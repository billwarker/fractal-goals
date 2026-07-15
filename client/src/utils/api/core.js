import axios from 'axios';
import { isPublicLandingLocation } from '../marketingHost';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

axios.defaults.withCredentials = true;
axios.defaults.timeout = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000);

let accessToken = null;
let isRefreshing = false;
let csrfFetchPromise = null;
let failedQueue = [];
let hasDispatchedSessionExpired = false;
const CSRF_COOKIE_NAME = 'fractal_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const getHeader = (headers, name) => {
    if (!headers) return undefined;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
};

const setHeader = (config, name, value) => {
    config.headers = config.headers || {};
    if (typeof config.headers.set === 'function') {
        config.headers.set(name, value);
    } else {
        config.headers[name] = value;
    }
};

const getResponseHeader = (headers, name) => getHeader(headers, name);

export const setAccessToken = (token) => {
    accessToken = token || null;
    if (token) {
        hasDispatchedSessionExpired = false;
    }
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
    if (url.includes('/public/')) return false;
    if (getHeader(config.headers, 'Authorization') || accessToken) return false;
    if (
        url.includes('/auth/login')
        || url.includes('/auth/signup')
        || url.includes('/auth/refresh')
        || url.includes('/auth/password/forgot')
        || url.includes('/auth/password/reset')
    ) return false;
    return true;
};

const ensureCsrfToken = async (config, { force = false } = {}) => {
    let token = readCookie(CSRF_COOKIE_NAME);
    if ((token && !force) || config._skipCsrfFetch) return token;

    if (!csrfFetchPromise) {
        csrfFetchPromise = axios.get(`${API_BASE}/auth/csrf`, { _skipCsrfFetch: true })
            .then((response) => (
                response.data?.csrf_token
                || getResponseHeader(response.headers, CSRF_HEADER_NAME)
                || readCookie(CSRF_COOKIE_NAME)
                || null
            ))
            .finally(() => {
                csrfFetchPromise = null;
            });
    }
    return csrfFetchPromise;
};

const isCsrfAuthFailure = (error) => (
    error?.response?.status === 403
    && /csrf/i.test(String(error.response?.data?.error || ''))
);

const dispatchSessionExpired = (detail = {}) => {
    if (typeof window === 'undefined' || hasDispatchedSessionExpired || isPublicLandingLocation()) return;
    hasDispatchedSessionExpired = true;
    window.dispatchEvent(new CustomEvent('auth:session_expired', { detail }));
};

axios.interceptors.request.use(async (config) => {
    const isPublicRequest = String(config.url || '').includes('/public/');
    if (accessToken && !isPublicRequest && !config._skipAuth && !getHeader(config.headers, 'Authorization')) {
        setHeader(config, 'Authorization', `Bearer ${accessToken}`);
    }
    if (String(config.url || '').includes('/auth/refresh') && !getHeader(config.headers, CSRF_HEADER_NAME)) {
        const csrfToken = readCookie(CSRF_COOKIE_NAME);
        if (csrfToken) {
            setHeader(config, CSRF_HEADER_NAME, decodeURIComponent(csrfToken));
        }
    }
    if (needsCsrfHeader(config) && !getHeader(config.headers, CSRF_HEADER_NAME)) {
        const csrfToken = await ensureCsrfToken(config);
        if (csrfToken) {
            setHeader(config, CSRF_HEADER_NAME, decodeURIComponent(csrfToken));
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

        if (isCsrfAuthFailure(error) && originalRequest && !originalRequest._csrfRetry && needsCsrfHeader(originalRequest)) {
            originalRequest._csrfRetry = true;
            try {
                const csrfToken = await ensureCsrfToken(originalRequest, { force: true });
                if (csrfToken) {
                    setHeader(originalRequest, CSRF_HEADER_NAME, decodeURIComponent(csrfToken));
                    return axios(originalRequest);
                }
            } catch (csrfRefreshError) {
                clearAccessToken();
                dispatchSessionExpired({ reason: 'csrf_expired' });
                return Promise.reject(csrfRefreshError);
            }
            clearAccessToken();
            dispatchSessionExpired({ reason: 'csrf_expired' });
        }

        if (error.response?.status === 401 && !originalRequest?._retry) {
            if (
                originalRequest?.url?.includes('/auth/refresh') ||
                originalRequest?.url?.includes('/auth/login') ||
                originalRequest?.url?.includes('/auth/me') ||
                originalRequest?.url?.includes('/auth/csrf') ||
                originalRequest?.url?.includes('/public/')
            ) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    if (token) {
                        setHeader(originalRequest, 'Authorization', `Bearer ${token}`);
                    }
                    return axios(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const response = await axios.post(`${API_BASE}/auth/refresh`, {}, { _skipCsrfFetch: true });

                const { token, user } = response.data;
                hasDispatchedSessionExpired = false;
                setAccessToken(token);
                window.dispatchEvent(new CustomEvent('auth:token_refreshed', { detail: { token, user } }));

                processQueue(null, token);

                if (!getHeader(originalRequest.headers, CSRF_HEADER_NAME) && needsCsrfHeader(originalRequest)) {
                    const csrfToken = await ensureCsrfToken(originalRequest);
                    if (csrfToken) {
                        setHeader(originalRequest, CSRF_HEADER_NAME, decodeURIComponent(csrfToken));
                    }
                }

                return axios(originalRequest);
            } catch (refreshError) {
                clearAccessToken();
                processQueue(refreshError, null);
                dispatchSessionExpired({ reason: 'refresh_failed' });
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
