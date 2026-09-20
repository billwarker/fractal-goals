import { authApi } from './api/authApi';
import { fractalApi } from './api/fractalApi';
import { globalApi } from './api/globalApi';
import { adminApi } from './api/adminApi';
import { publicApi } from './api/publicApi';
import { telemetryApi } from './api/telemetryApi';
import { agentApi } from './api/agentApi';

export { API_BASE, axios, setAccessToken, clearAccessToken } from './api/core';
export { authApi, fractalApi, globalApi, adminApi, publicApi, telemetryApi, agentApi };

export default {
    global: globalApi,
    fractal: fractalApi,
    auth: authApi,
    admin: adminApi,
    public: publicApi,
    telemetry: telemetryApi,
    agent: agentApi,
};
