import React from 'react';

import { NOTE_CATEGORIES } from '../../../utils/noteTypes';
import Badge from '../../atoms/Badge';
import styles from './NotesFilters.module.css';

const CATEGORY_LABELS = Object.fromEntries(NOTE_CATEGORIES.map((category) => [category.value, category.label]));

export const formatDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const namesOf = (ids, names, singular, plural) => {
    if (!ids.length) return [];
    if (ids.length > 2) return [`${ids.length} ${plural}`];
    return ids.map((id) => names[id] || singular);
};

/** The active Notes filters as short labels, shown beside the note count in the page header. */
export function filterConditionLabels({ filters, savedFilters, activeSavedIds, goalNames = {}, activityNames = {} }) {
    return [
        ...savedFilters.filter((filter) => activeSavedIds.includes(filter.id)).map((filter) => filter.name),
        filters.text && `“${filters.text}”`,
        ...filters.categories.map((category) => CATEGORY_LABELS[category]),
        ...namesOf(filters.goalIds, goalNames, 'Goal', 'goals'),
        ...namesOf(filters.activityIds, activityNames, 'Activity', 'activities'),
        filters.pinnedOnly && 'Pinned',
        filters.day && formatDay(filters.day),
    ].filter(Boolean);
}

export default function FilterConditions({ labels }) {
    if (!labels.length) return null;
    return (
        <span className={styles.conditionsInline} aria-label={`Filtered by ${labels.join(', ')}`}>
            {labels.map((label, index) => <Badge key={`${label}-${index}`} size="sm">{label}</Badge>)}
        </span>
    );
}
