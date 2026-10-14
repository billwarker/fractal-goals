import { idbDelete, idbGet, idbSet } from './idbKeyValue';

// A quick session lives entirely on the device until it is completed. Keeping
// the draft here means a reload, a crash, or a dead battery never loses a workout.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (userId, rootId) => `quick-draft:${userId}:${rootId}`;

export function saveQuickSessionDraft(userId, rootId, { draft, template }) {
    if (!userId || !rootId || !draft || !template) return Promise.resolve();
    return idbSet(keyFor(userId, rootId), { draft, template, savedAt: Date.now() });
}

export async function loadQuickSessionDraft(userId, rootId, { now = Date.now() } = {}) {
    if (!userId || !rootId) return null;
    const saved = await idbGet(keyFor(userId, rootId));
    if (!saved?.draft || !saved?.template) return null;
    if (now - saved.savedAt > MAX_AGE_MS) {
        await idbDelete(keyFor(userId, rootId));
        return null;
    }
    return saved;
}

export function clearQuickSessionDraft(userId, rootId) {
    if (!userId || !rootId) return Promise.resolve();
    return idbDelete(keyFor(userId, rootId));
}
