import { authApi } from './api/authApi';
import { fractalApi } from './api/fractalApi';
import { globalApi } from './api/globalApi';
import { legacyApi } from './api/legacyApi';

export { API_BASE, axios } from './api/core';
export { authApi, fractalApi, globalApi, legacyApi };

export default {
    global: globalApi,
    fractal: fractalApi,
    auth: authApi,
    legacy: legacyApi,
};
