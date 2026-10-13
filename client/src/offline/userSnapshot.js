import { idbDelete, idbGet, idbSet } from './idbKeyValue';

// The last signed-in user on this device, so the app can open an in-progress
// session with no signal. It grants nothing: every request still needs the
// server-side session, which is refreshed as soon as the connection returns.

const KEY = 'last-user';

export function saveUserSnapshot(user) {
    if (!user?.id) return Promise.resolve();
    return idbSet(KEY, { user, savedAt: Date.now() });
}

export async function loadUserSnapshot() {
    const saved = await idbGet(KEY);
    return saved?.user || null;
}

export function clearUserSnapshot() {
    return idbDelete(KEY);
}
