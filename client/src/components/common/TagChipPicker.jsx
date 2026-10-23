import React from 'react';

import { familiesWithMembers, groupTagsForPicker, toggleTagSelection } from '../../utils/tagPickerOptions';
import styles from './TagChipPicker.module.css';

/**
 * Tags as toggle chips in their tag colours, grouped by tag family (in family order, then
 * "Other tags"); a single-select family keeps one. Used by the Progress pane's Compare with and
 * Analytics' tag filter. `catalog` is `{ families, tags }`; `selectedIds` stay listed even if
 * archived.
 */
export default function TagChipPicker({
    catalog,
    selectedIds = [],
    onChange,
    disabled = false,
    ariaLabel = 'Tags',
    emptyText = 'No tags yet',
}) {
    const groups = groupTagsForPicker(catalog, { keepIds: selectedIds });
    const families = familiesWithMembers(catalog);
    if (!groups.length) return <span className={styles.empty}>{emptyText}</span>;
    return (
        <div className={styles.chips} aria-label={ariaLabel}>
            {groups.map((group) => (
                <div key={group.key} className={styles.group} role="group" aria-label={group.label}>
                    {groups.length > 1 || group.family ? (
                        <span className={styles.groupLabel}>{group.label}{group.singleSelect ? ' · single select' : ''}</span>
                    ) : null}
                    {group.tags.map((tag) => {
                        const selected = selectedIds.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                type="button"
                                className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
                                style={tag.color ? { '--tag-color': tag.color } : undefined}
                                aria-pressed={selected}
                                disabled={disabled}
                                onClick={() => onChange(toggleTagSelection(selectedIds, tag, families))}
                            >
                                {tag.name}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
