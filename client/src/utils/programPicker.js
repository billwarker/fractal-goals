import { formatLiteralDate } from './dateUtils';
import { getProgramStatus } from './programGoalWindow';

export const PROGRAM_PICKER_FILTERS = [
    ['all', 'All'],
    ['active', 'Active'],
    ['upcoming', 'Upcoming'],
    ['completed', 'Completed'],
];

const datePart = (value) => (value ? String(value).split('T')[0] : '');

/**
 * Programs grouped by status for the program picker, filtered by a free-text
 * query (name or formatted dates) and a status filter. Active and upcoming
 * programs sort by start date; completed ones by most recent end date.
 */
export function groupProgramsByStatus(programs, { query = '', filter = 'all', today } = {}) {
    const normalizedQuery = query.trim().toLowerCase();
    const groups = { active: [], upcoming: [], completed: [] };
    programs.forEach((program) => {
        const bucket = getProgramStatus(program, today);
        const matchesQuery = !normalizedQuery
            || program.name.toLowerCase().includes(normalizedQuery)
            || `${formatLiteralDate(program.start_date)} ${formatLiteralDate(program.end_date)}`.toLowerCase().includes(normalizedQuery);
        // Undated programs ('inactive') have no picker group.
        if (!groups[bucket]) return;
        if (matchesQuery && (filter === 'all' || filter === bucket)) groups[bucket].push(program);
    });
    const byStart = (a, b) => datePart(a.start_date).localeCompare(datePart(b.start_date));
    groups.active.sort(byStart);
    groups.upcoming.sort(byStart);
    groups.completed.sort((a, b) => datePart(b.end_date).localeCompare(datePart(a.end_date)));
    return groups;
}
