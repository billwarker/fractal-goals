const read = (goal, key) => goal?.[key] ?? goal?.attributes?.[key] ?? null;

/**
 * Whether Goal Detail asks for a completion note: the goal is complete, has none, and the prompt
 * wasn't dismissed since this completion (a later completion asks again).
 */
export function shouldPromptCompletionNote(goal, completionNote) {
    if (!read(goal, 'completed') || completionNote) return false;
    const dismissedAt = goal?.completion_state?.note_dismissed_at;
    if (!dismissedAt) return true;
    const completedAt = read(goal, 'completed_at');
    return Boolean(completedAt) && Date.parse(completedAt) > Date.parse(dismissedAt);
}
