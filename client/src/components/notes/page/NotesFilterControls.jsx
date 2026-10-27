import React, { useEffect, useState } from 'react';

import { NOTE_CATEGORIES } from '../../../utils/noteTypes';
import { FilterPlusIcon } from '../../atoms/AppIcons';
import FilterModal from './FilterModal';
import NotesHeatmap from './NotesHeatmap';
import SavedFilters from './SavedFilters';
import styles from './NotesFilters.module.css';

const SEARCH_DELAY_MS = 300;

/** Search box that commits after typing pauses, so each keystroke doesn't refetch. */
function SearchField({ value, onChange, onCreateFilter }) {
    const [draft, setDraft] = useState(value);
    const [committed, setCommitted] = useState(value);
    if (value !== committed) {
        // The URL changed (cleared, back/forward): show it.
        setCommitted(value);
        setDraft(value);
    }
    useEffect(() => {
        if (draft === value) return undefined;
        const timer = setTimeout(() => onChange(draft), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [draft, value, onChange]);
    return (
        <div className={styles.search}>
            <input
                type="search"
                aria-label="Search notes"
                placeholder='Words or "a phrase"'
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') onChange(draft); }}
            />
            <button type="button" className={styles.searchAction} aria-label="Create filter"
                title="Create a saved filter from this search" onClick={() => onCreateFilter(draft)}>
                <FilterPlusIcon size={16} />
            </button>
        </div>
    );
}

export const formatDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function NotesFilterControls({
    rootId, filters, apiFilters, updateFilters, activityCount, onPickGoal, onPickActivities, saved,
}) {
    const [editing, setEditing] = useState(null); // { filter } to edit, or { searchText } to create.
    const toggleCategory = (value) => updateFilters({
        categories: filters.categories.includes(value)
            ? filters.categories.filter((category) => category !== value)
            : [...filters.categories, value],
    });
    return (
        <div className={styles.controls}>
            <section className={styles.section} aria-labelledby="notes-heatmap-title">
                <div className={styles.sectionHeader}>
                    <h4 id="notes-heatmap-title">Notes Heatmap</h4>
                    {filters.day && (
                        <button type="button" className={styles.linkButton} onClick={() => updateFilters({ day: null })}>
                            Show all days
                        </button>
                    )}
                </div>
                {filters.day && <p className={styles.heatmapSummary}>Showing {formatDay(filters.day)}</p>}
                <NotesHeatmap rootId={rootId} apiFilters={apiFilters} selectedDay={filters.day}
                    onSelectDay={(day) => updateFilters({ day })} />
            </section>

            <section className={styles.section} aria-labelledby="notes-search-title">
                <div className={styles.sectionHeader}><h4 id="notes-search-title">Search</h4></div>
                <SearchField value={filters.text} onChange={(text) => updateFilters({ text })}
                    onCreateFilter={(searchText) => setEditing({ searchText })} />
            </section>

            <SavedFilters
                savedFilters={saved.savedFilters}
                activeIds={saved.activeIds}
                onToggle={saved.onToggle}
                onEdit={(filter) => setEditing({ filter })}
                onDelete={saved.onDelete}
            />

            <section className={styles.section} aria-labelledby="notes-category-title">
                <div className={styles.sectionHeader}><h4 id="notes-category-title">Category</h4></div>
                <div className={styles.segments} role="group" aria-labelledby="notes-category-title">
                    <button type="button" className={styles.toggle} aria-pressed={!filters.categories.length}
                        onClick={() => updateFilters({ categories: [] })}>All</button>
                    {NOTE_CATEGORIES.map((category) => (
                        <button key={category.value} type="button" className={styles.toggle}
                            aria-pressed={filters.categories.includes(category.value)} onClick={() => toggleCategory(category.value)}>
                            {category.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className={styles.section} aria-labelledby="notes-links-title">
                <div className={styles.sectionHeader}><h4 id="notes-links-title">Goal &amp; Activity</h4></div>
                <button type="button" className={styles.pickRow} onClick={onPickGoal}>
                    <span>Goal</span><strong>{filters.goalId ? (filters.goalName || 'Selected goal') : 'Any'}</strong>›
                </button>
                <button type="button" className={styles.pickRow} onClick={onPickActivities}>
                    <span>Activity</span><strong>{activityCount ? `${activityCount} selected` : 'Any'}</strong>›
                </button>
                <label className={styles.check}>
                    <input type="checkbox" checked={filters.pinnedOnly} onChange={(event) => updateFilters({ pinnedOnly: event.target.checked })} />
                    Pinned notes only
                </label>
            </section>

            {editing && (
                <FilterModal
                    filter={editing.filter}
                    searchText={editing.searchText}
                    current={filters}
                    onSubmit={(name, spec) => (editing.filter ? saved.onUpdate(editing.filter, name, spec) : saved.onCreate(name, spec))}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
