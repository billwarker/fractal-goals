// @ts-check
/** How a feed note's context reads: set values, goal paths and where the note leads. */

/**
 * "80 kg · 5 reps", "Left 30 s"; the metrics of one set as recorded.
 * @param {Array<{ name?: string, value: number, unit?: string, split_name?: string | null }> | null} [metrics]
 */
export function formatSetMetrics(metrics) {
    return (metrics || [])
        .filter((metric) => metric.value !== null && metric.value !== undefined)
        .map((metric) => {
            const value = metric.unit ? `${metric.value} ${metric.unit}` : `${metric.value} ${metric.name || ''}`.trim();
            return metric.split_name ? `${metric.split_name} ${value}` : value;
        })
        .join(' · ');
}

/**
 * Where the note was written, as a link target; null when it has no page of its own.
 * @param {any} note
 * @param {string} rootId
 * @returns {{ to: string, label: string } | null}
 */
export function noteContextLink(note, rootId) {
    if (note.session_id) return { to: `/${rootId}/session/${note.session_id}`, label: 'Open session' };
    if (note.goal_id) return { to: `/${rootId}/goals?goal=${encodeURIComponent(note.goal_id)}`, label: 'Open goal' };
    const programId = note.program_id || (note.context_type === 'program' ? note.context_id : null);
    if (programId) return { to: `/${rootId}/programs/${programId}`, label: 'Open program' };
    return null;
}
