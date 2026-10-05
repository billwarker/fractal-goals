import { blockWeeks, trackedWeekStartDay } from './programBlockWeeks';

/**
 * Pure view model for the calendar side pane's Blocks section: one card per block,
 * joining the program's blocks with whole-program metrics (calculation v9) for status
 * counts, consistency, longest streak, and the program goals due in each block.
 */

/** Active, upcoming, or completed, like a program's own status; ``null`` when undated. */
export function blockStatus(start, end, today) {
    if (!start || !end || !today) return null;
    if (today < start) return 'upcoming';
    if (today > end) return 'completed';
    return 'active';
}

/**
 * Join program blocks and metrics into side pane cards.
 * @param {{ blocks?: any[], metrics?: any, today?: string | null }} options
 */
export function buildBlockCards({ blocks = [], metrics = null, today = null }) {
    const metricsById = new Map((metrics?.blocks || []).map((row) => [row.block_id, row]));
    const asOf = today || metrics?.window?.as_of || null;
    return blocks.map((block) => {
        const metricsRow = metricsById.get(block.id) || null;
        const startDate = block.start_date?.slice(0, 10) || null;
        const endDate = block.end_date?.slice(0, 10) || null;
        // Same weeks as the metrics: tracked blocks start weeks on their chosen weekday.
        const weeks = blockWeeks(startDate, endDate, trackedWeekStartDay(block));
        return {
            block,
            id: block.id,
            name: block.name,
            color: block.color || '#3A86FF',
            startDate,
            endDate,
            status: blockStatus(startDate, endDate, asOf),
            weekCount: weeks.length,
            currentWeekIndex: weeks.find((week) => asOf && week.start <= asOf && asOf <= week.end)?.index ?? null,
            consistency: metricsRow?.consistency || null,
            statusCounts: metricsRow?.status_counts || null,
            longestStreak: metricsRow?.longest_streak ?? null,
            goals: metricsRow?.goals || null,
        };
    });
}
