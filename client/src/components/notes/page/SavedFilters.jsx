import React, { useState } from 'react';

import Button from '../../atoms/Button';
import NoteOptionsMenu from '../NoteOptionsMenu';
import styles from './NotesFilters.module.css';

const errorText = (error) => error?.response?.data?.error || error?.message || 'Something went wrong. Try again.';

/**
 * Saved filters as compact toggles in the Notes side pane. Several can be on; a note must
 * match all of them, plus the search and filters set elsewhere in the pane.
 */
export default function SavedFilters({ savedFilters, activeIds, onToggle, onEdit, onDelete }) {
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [error, setError] = useState('');
    const remove = async (filter) => {
        setError('');
        try {
            await onDelete(filter);
            setConfirmDelete(null);
        } catch (failure) {
            setError(errorText(failure));
        }
    };

    return (
        <section className={styles.section} aria-labelledby="notes-saved-title">
            <div className={styles.sectionHeader}><h4 id="notes-saved-title">Saved Filters</h4></div>
            {savedFilters.length > 0 ? (
                <ul className={styles.savedList} aria-labelledby="notes-saved-title">
                    {savedFilters.map((filter) => {
                        const active = activeIds.includes(filter.id);
                        return (
                            <li key={filter.id} className={styles.saved} data-active={active}>
                                <button type="button" className={styles.savedToggle} aria-pressed={active} onClick={() => onToggle(filter.id)}>
                                    {filter.name}
                                </button>
                                <NoteOptionsMenu
                                    label={`${filter.name} options`}
                                    className={styles.savedMenu}
                                    items={[
                                        { label: 'Edit…', onSelect: () => onEdit(filter) },
                                        { label: 'Delete', danger: true, onSelect: () => setConfirmDelete(filter) },
                                    ]}
                                />
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className={styles.hint}>Use the filter button in the search bar to save a search you want to reuse.</p>
            )}
            {activeIds.length > 1 && <p className={styles.hint}>Showing notes that match all selected filters.</p>}
            {confirmDelete && (
                <div className={styles.nameForm} role="group" aria-label={`Confirm deleting ${confirmDelete.name}`}>
                    <span className={styles.hint}>Delete the “{confirmDelete.name}” filter? Notes are not affected.</span>
                    <Button size="sm" variant="danger" onClick={() => remove(confirmDelete)}>Delete</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                </div>
            )}
            {error && <p role="alert" className={styles.error}>{error}</p>}
        </section>
    );
}
