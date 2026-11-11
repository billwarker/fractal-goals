import React from 'react';

import FilterSelectionTooltip from './FilterSelectionTooltip';
import styles from './FilterPickerField.module.css';

/**
 * A sidebar filter that opens a picker: its name, with a filter mark once something is selected whose tooltip
 * lists the selection (as on Analytics), how many are selected, and a "Choose …" button. Shared by the Sessions
 * and Notes filters so they read alike.
 */
export default function FilterPickerField({
    title, chooseLabel, count, selectedNames = [], onChoose, disabled = false,
}) {
    // `count` is of the selected ids; a name can be missing for something since deleted.
    const selectedCount = count ?? selectedNames.length;
    const details = `${selectedCount} selected: ${selectedNames.join(', ')}`;
    return (
        <div className={styles.field}>
            <div className={styles.header}>
                <div className={styles.label}>
                    <h4>{title}</h4>
                    {selectedCount > 0 ? <FilterSelectionTooltip title={title} details={details} /> : null}
                </div>
                <span>{selectedCount} selected</span>
            </div>
            <button type="button" className={styles.chooseButton} onClick={onChoose} disabled={disabled}>
                {selectedCount > 0 ? `${chooseLabel} (${selectedCount})` : chooseLabel}
            </button>
        </div>
    );
}
