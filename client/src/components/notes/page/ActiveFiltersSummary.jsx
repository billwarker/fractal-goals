import React from 'react';

import { NOTE_CATEGORIES } from '../../../utils/noteTypes';
import { formatDay } from './NotesFilterControls';
import styles from './NotesFilters.module.css';

const CATEGORY_LABELS = Object.fromEntries(NOTE_CATEGORIES.map((category) => [category.value, category.label]));

/** Read-only line above the feed naming what's filtered; filters are managed in the side pane. */
export default function ActiveFiltersSummary({ filters, savedFilters, activeSavedIds, onEdit, onClear }) {
    const parts = [
        ...savedFilters.filter((filter) => activeSavedIds.includes(filter.id)).map((filter) => filter.name),
        filters.text && `“${filters.text}”`,
        ...filters.categories.map((category) => CATEGORY_LABELS[category]),
        filters.goalId && (filters.goalName || 'Goal'),
        (filters.activityIds.length + filters.groupIds.length) > 0 && `${filters.activityIds.length + filters.groupIds.length} activities`,
        filters.pinnedOnly && 'Pinned',
        filters.day && formatDay(filters.day),
    ].filter(Boolean);
    if (!parts.length) return null;
    return (
        <div className={styles.summary} role="status">
            <span className={styles.summaryText}>Filtered by {parts.join(' · ')}</span>
            <button type="button" className={styles.linkButton} onClick={onEdit}>Edit filters</button>
            <button type="button" className={styles.linkButton} onClick={onClear}>Clear</button>
        </div>
    );
}
