import { shouldPromptCompletionNote } from '../goalCompletionNote';

const completed = (state = {}) => ({
    id: 'g', completed: true, completed_at: '2026-11-15T10:00:00Z', completion_state: { note_dismissed_at: null, ...state },
});

describe('shouldPromptCompletionNote', () => {
    it('asks a completed goal with no completion note', () => {
        expect(shouldPromptCompletionNote(completed(), null)).toBe(true);
    });

    it('never asks an open goal, or one that has its note', () => {
        expect(shouldPromptCompletionNote({ completed: false }, null)).toBe(false);
        expect(shouldPromptCompletionNote(completed(), { id: 'n', note_kind: 'goal_completion' })).toBe(false);
    });

    it('stays dismissed for this completion and asks again for a later one', () => {
        expect(shouldPromptCompletionNote(completed({ note_dismissed_at: '2026-11-15T11:00:00Z' }), null)).toBe(false);
        expect(shouldPromptCompletionNote({
            ...completed({ note_dismissed_at: '2026-11-15T11:00:00Z' }), completed_at: '2026-11-20T09:00:00Z',
        }, null)).toBe(true);
    });
});
