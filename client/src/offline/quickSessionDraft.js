import { idbDeletePrefix } from './idbKeyValue';

// Quick session drafts are no longer kept on the device: one lives only while Create Session
// is open. Earlier versions saved them here; sign-out still removes any left behind.

/** Sign-out removes every quick session draft an earlier version left on the device for this user. */
export function clearQuickSessionDraftsForUser(userId) {
    return userId ? idbDeletePrefix(`quick-draft:${userId}:`) : Promise.resolve();
}
