import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

axios.defaults.withCredentials = true;

let accessToken = null;
let isRefreshing = false;
let failedQueue = [];

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

axios.interceptors.request.use((config) => {
    if (accessToken && !config.headers?.Authorization) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${accessToken}`;
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
                originalRequest?.url?.includes('/auth/me')
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
                const response = await axios.post(`${API_BASE}/auth/refresh`, {});

                const { token, user } = response.data;
                setAccessToken(token);
                window.dispatchEvent(new CustomEvent('auth:token_refreshed', { detail: { token, user } }));

                processQueue(null, token);

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
