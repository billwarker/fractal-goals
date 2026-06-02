import { authApi } from './api/authApi';
import { fractalApi } from './api/fractalApi';
import { globalApi } from './api/globalApi';
import { legacyApi } from './api/legacyApi';
import { adminApi } from './api/adminApi';

export { API_BASE, axios, setAccessToken, clearAccessToken } from './api/core';
export { authApi, fractalApi, globalApi, legacyApi, adminApi };

export default {
    global: globalApi,
    fractal: fractalApi,
    auth: authApi,
    admin: adminApi,
    legacy: legacyApi,
};
