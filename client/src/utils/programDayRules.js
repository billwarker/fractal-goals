// A program day's completion rule in words. Sessions and activities are one pool: every required
// item must be done and, with a minimum, at least that many in all; with neither, any one item.
// The server decides (services/program_day_occurrences.py); this only describes the rule.

const plural = (count, word) => `${count} required ${word}${count === 1 ? '' : 's'}`;

export function describeDayCompletion({ requiredSessions = 0, requiredActivities = 0, minimum = null, itemCount = 0 }) {
    if (!itemCount) return '';
    const required = [
        requiredSessions ? plural(requiredSessions, 'session') : null,
        requiredActivities ? plural(requiredActivities, 'activity').replace(/activitys$/, 'activities') : null,
    ].filter(Boolean).join(' and ');
    const atLeast = minimum ? `at least ${minimum} of ${itemCount} in all` : '';
    if (required && atLeast) return `Done when its ${required} are completed, and ${atLeast}.`;
    if (required) return `Done when its ${required} ${requiredSessions + requiredActivities === 1 ? 'is' : 'are'} completed.`;
    if (atLeast) return `Done when ${atLeast.replace(' in all', '')} are completed.`;
    return 'Done when any one of them is completed.';
}

/** Create Session with a quick session already holding these activities. */
export function quickSessionWithActivitiesPath(rootId, activityIds) {
    const ids = [...new Set(activityIds || [])].filter(Boolean);
    return `/${rootId}/create-session?source=quick${ids.length ? `&activities=${ids.map(encodeURIComponent).join(',')}` : ''}`;
}
