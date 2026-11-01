import React from 'react';

import { formatBucketLabel } from '../../utils/chartFormat';
import Badge from '../atoms/Badge';
import { FILTER_LABELS } from './visualizations/capabilities';
import styles from './AnalyticsActiveFilterChips.module.css';

/** "Blues", "Blues +2" */
function summarizeNames(names) {
    if (names.length === 0) return '';
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

function rangeSummary(dateRange) {
    const day = (value) => formatBucketLabel(value, 'day');
    if (dateRange?.start && dateRange?.end) return `${day(dateRange.start)} – ${day(dateRange.end)}`;
    if (dateRange?.start) return `Since ${day(dateRange.start)}`;
    return `Until ${day(dateRange.end)}`;
}

const countOf = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

/**
 * The filters that are set, as chips above the pane: each says what it holds, opens its editor, and
 * removes it with ✕. A filter the selected chart doesn't use is muted and says so, so the chart's
 * scope is never overstated.
 *
 * @param {{
 *   active: string[],
 *   filters: any,
 *   dateRange: any,
 *   goalNames: string[],
 *   activityNames: string[],
 *   notAppliedTo: (id: string) => string | null,
 *   onEdit: (id: string) => void,
 *   onRemove: (id: string) => void,
 * }} props
 */
export default function AnalyticsActiveFilterChips({ active, filters, dateRange, goalNames, activityNames, notAppliedTo, onEdit, onRemove }) {
    if (active.length === 0) return null;
    const summaries = {
        timeRange: () => rangeSummary(dateRange),
        goals: () => summarizeNames(goalNames),
        activities: () => summarizeNames(activityNames),
        tags: () => {
            const count = filters.tags?.tagIds?.length || 0;
            if (count === 0) return 'Untagged';
            return `${countOf(count, 'tag', 'tags')}${filters.tags.match === 'exact' ? ' · exact set' : ''}`;
        },
        templates: () => countOf(filters.sessions.templateIds.length, 'template', 'templates'),
        programDays: () => countOf(filters.sessions.programDayIds.length, 'day', 'days'),
    };

    return (
        <ul className={styles.list} aria-label="Active filters">
            {active.map((id) => {
                const ignoredBy = notAppliedTo(id);
                const label = FILTER_LABELS[id];
                const value = summaries[id]();
                return (
                    <li key={id} title={ignoredBy ? `Not applied to ${ignoredBy}` : undefined}>
                        <Badge size="sm" className={`${styles.filter} ${ignoredBy ? styles.ignored : ''}`}>
                            <button
                                type="button"
                                className={styles.edit}
                                aria-label={`${label}: ${value}${ignoredBy ? ` (not applied to ${ignoredBy})` : ''}. Edit`}
                                onClick={() => onEdit(id)}
                            >
                                <span className={styles.name}>{label}</span>
                                <span className={styles.value}>{value}</span>
                            </button>
                            <button type="button" className={styles.remove} aria-label={`Remove ${label.toLowerCase()} filter`} onClick={() => onRemove(id)}>
                                ×
                            </button>
                        </Badge>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * "+ Add filters": the optional filters (the selected chart's, else the page's) as toggles. A filter that's set stays shown
 * (it can be cleared from its chip); the choice is saved with the chart's state.
 */
export function AddFilterToggles({ chartName, optionalFilters, isVisible, active, onToggle }) {
    const [open, setOpen] = React.useState(false);
    if (optionalFilters.length === 0) return null;
    return (
        <div className={styles.addFilter}>
            <button type="button" className={styles.addFilterToggle} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                {open ? 'Done choosing filters' : `+ Add filters${chartName ? ` for ${chartName}` : ''}`}
            </button>
            {open && (
                <ul className={styles.addFilterOptions} aria-label="Additional filters">
                    {optionalFilters.map((id) => {
                        const set = active.includes(id);
                        return (
                            <li key={id}>
                                <button
                                    type="button"
                                    className={`sessions-query-chip ${isVisible(id) ? 'active' : ''}`}
                                    aria-pressed={isVisible(id)}
                                    disabled={set}
                                    title={set ? 'Shown while it’s set' : undefined}
                                    onClick={() => onToggle(id)}
                                >
                                    {FILTER_LABELS[id]}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
