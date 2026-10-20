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

/** The Notes page's type filter. */
export const NOTE_TYPE_FILTER_OPTIONS = [
    { value: 'fractal_note', label: 'Fractal Notes' },
    { value: 'goal_note', label: 'Goal Notes' },
    { value: 'goal_review_note', label: 'Goal Reviews' },
    { value: 'goal_completion_note', label: 'Goal Completions' },
    { value: 'program_note', label: 'Program Notes' },
    { value: 'session_note', label: 'Session Notes' },
    { value: 'activity_instance_note', label: 'Activity Notes' },
    { value: 'activity_set_note', label: 'Activity Set Notes' },
    { value: 'activity_definition_note', label: 'Activity Definition Notes' },
    { value: 'circuit_run_note', label: 'Activity Circuit Notes' },
    { value: 'circuit_round_note', label: 'Circuit Round Notes' },
];
