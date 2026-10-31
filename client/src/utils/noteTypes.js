/** Note types (derived on the server from a note's context and kind) and how they read. */

export const NOTE_TYPE_LABELS = {
    fractal_note: 'Fractal Note',
    goal_note: 'Goal Note',
    goal_completion_note: 'Goal Completion Note',
    goal_review_note: 'Goal Review Note',
    session_note: 'Session Note',
    program_note: 'Program Note',
    activity_instance_note: 'Activity Instance Note',
    activity_set_note: 'Activity Set Note',
    activity_definition_note: 'Activity Definition Note',
    circuit_run_note: 'Activity Circuit Note',
    circuit_round_note: 'Circuit Round Note',
    note: 'Note',
};

/** Badges for explicit note kinds. */
export const NOTE_KIND_LABELS = {
    goal_completion: 'Goal Completion',
    goal_review: 'Goal Review',
};

/** Note types attached to a goal itself. */
export const GOAL_NOTE_TYPES = new Set(['goal_note', 'goal_completion_note', 'goal_review_note']);

/**
 * Reader-facing categories, by where a note was written. Mirrors CATEGORY_CONTEXT_TYPES in
 * services/note_filter_spec.py; both are checked against tests/fixtures/note_categories.json.
 */
export const NOTE_CATEGORIES = [
    { value: 'general', label: 'General', contextTypes: ['root', 'activity_definition'] },
    { value: 'goals', label: 'Goals', contextTypes: ['goal'] },
    { value: 'sessions', label: 'Sessions', contextTypes: ['session', 'activity_instance', 'circuit_run', 'circuit_round'] },
    { value: 'programs', label: 'Programs', contextTypes: ['program'] },
];

const CATEGORY_BY_CONTEXT = Object.fromEntries(NOTE_CATEGORIES.flatMap(
    (category) => category.contextTypes.map((contextType) => [contextType, category.value]),
));

/** Mirrors derive_note_category in services/note_filter_spec.py. */
export function deriveNoteCategory(contextType) {
    return CATEGORY_BY_CONTEXT[contextType] || 'general';
}
