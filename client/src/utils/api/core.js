import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

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
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return axios(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const response = await axios.post(`${API_BASE}/auth/refresh`, {}, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });

                const { token, user } = response.data;
                localStorage.setItem('token', token);
                window.dispatchEvent(new CustomEvent('auth:token_refreshed', { detail: { token, user } }));

                originalRequest.headers.Authorization = `Bearer ${token}`;
                processQueue(null, token);

                return axios(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                localStorage.removeItem('token');
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
        params.append(mappings[key] || key, value);
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

export { axios };
