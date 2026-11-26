// A native app's session: a short access token in memory, renewed by a refresh token that the
// system keeps. Each renewal replaces the refresh token. Loaded only inside a shell.

import { getShell } from './index';

const SECRET_KEY = 'refresh-token';

let renewing = null;

export function createNativeSession({ post, apiBase }) {
    const { invoke, platform, deviceName } = getShell();

    const keep = async ({ access_token: token, refresh_token: refreshToken, user }) => {
        // Saved before the new token is used: until then the server still takes the old one.
        await invoke('secret_set', { key: SECRET_KEY, value: refreshToken });
        return { data: { token, user } };
    };

    const renew = async () => {
        const refreshToken = await invoke('secret_get', { key: SECRET_KEY });
        if (!refreshToken) {
            throw Object.assign(new Error('Not signed in'), { response: { status: 401, data: {} } });
        }
        try {
            return await keep((await post(`${apiBase}/auth/token/refresh`, { refresh_token: refreshToken })).data);
        } catch (error) {
            if (error?.response?.status === 401) await invoke('secret_delete', { key: SECRET_KEY });
            throw error;
        }
    };

    return {
        async signIn({ username_or_email: identifier, password }) {
            const response = await post(`${apiBase}/auth/token`, {
                username_or_email: identifier, password, platform, device_name: deviceName,
            });
            return keep(response.data);
        },
        // One at a time: two renewals with the same token would look like a stolen one.
        refresh() {
            renewing ??= renew().finally(() => {
                renewing = null;
            });
            return renewing;
        },
        /** Signs out here even with no signal; the server forgets an unused device on its own. */
        async signOut() {
            const refreshToken = await invoke('secret_get', { key: SECRET_KEY });
            await invoke('secret_delete', { key: SECRET_KEY });
            if (refreshToken) await post(`${apiBase}/auth/token/revoke`, { refresh_token: refreshToken }).catch(() => {});
        },
        forget: () => invoke('secret_delete', { key: SECRET_KEY }),
    };
}
