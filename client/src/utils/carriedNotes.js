// @ts-check
/**
 * Notes pinned to "next time" from earlier sessions, picked out of a session's carried notes
 * (`GET …/sessions/<id>/carried-notes`). They are marked `isCarried`, so note cards show where they
 * came from and offer only to unpin them.
 */

const EMPTY = { pending: [], delivered: [] };

/** @param {any[]} notes */
const asCarried = (notes) => notes.map((note) => ({ ...note, isCarried: true }));

/**
 * Notes carried to this instance: pins waiting for its activity, and those this instance used.
 * @param {{ pending: any[], delivered: any[] } | null | undefined} carried
 * @param {{ id?: string, activity_definition_id?: string } | null | undefined} instance
 */
export function carriedNotesForInstance(carried, instance) {
    const { pending, delivered } = carried || EMPTY;
    return asCarried([
        ...delivered.filter((note) => note.carried_into_instance_id === instance?.id),
        ...pending.filter((note) => note.activity_definition_id === instance?.activity_definition_id),
    ]);
}

/**
 * Session notes carried to this session: pins waiting for the next session, and those this session used.
 * @param {{ pending: any[], delivered: any[] } | null | undefined} carried
 * @param {string} sessionId
 */
export function carriedNotesForSession(carried, sessionId) {
    const { pending, delivered } = carried || EMPTY;
    return asCarried([
        ...delivered.filter((note) => note.carried_into_session_id === sessionId),
        ...pending.filter((note) => note.context_type === 'session'),
    ]);
}
