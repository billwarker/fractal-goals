import { describe, expect, it } from 'vitest';

import { carriedNotesForInstance, carriedNotesForSession } from '../carriedNotes';

const instance = { id: 'instance-2', activity_definition_id: 'bench' };
const carried = {
    pending: [
        { id: 'p1', activity_definition_id: 'bench', context_type: 'activity_instance' },
        { id: 'other', activity_definition_id: 'squat', context_type: 'activity_instance' },
        { id: 's1', activity_definition_id: null, context_type: 'session' },
    ],
    delivered: [
        { id: 'd1', activity_definition_id: 'bench', carried_into_instance_id: 'instance-2' },
        { id: 'elsewhere', activity_definition_id: 'bench', carried_into_instance_id: 'instance-9' },
        { id: 'ds', context_type: 'session', carried_into_session_id: 'session-1' },
    ],
};

describe('carried notes', () => {
    it('picks the notes waiting for this activity and those this instance used, marked as carried', () => {
        const notes = carriedNotesForInstance(carried, instance);
        expect(notes.map((note) => note.id)).toEqual(['d1', 'p1']);
        expect(notes.every((note) => note.isCarried)).toBe(true);
        expect(carriedNotesForInstance(undefined, instance)).toEqual([]);
    });

    it('picks session notes pinned to the next session and those this session used', () => {
        expect(carriedNotesForSession(carried, 'session-1').map((note) => note.id)).toEqual(['ds', 's1']);
    });
});
