import React from 'react';

import styles from './ActivityPicker.module.css';

function CountBadge({ count }) {
    if (!Number.isFinite(count) || count <= 0) return <span />;
    return <span className={styles.countBadge}>{count}</span>;
}

/** One selectable (or copyable) activity, with its group breadcrumb when listed flat. */
export function ActivityPickerActivityRow({
    activity,
    isSelected,
    isCopyMode,
    isSingleSelect,
    breadcrumb,
    count,
    details,
    onToggle,
}) {
    const actionLabel = isCopyMode
        ? `Copy ${activity.name}`
        : `${isSelected ? 'Deselect' : 'Select'} ${activity.name}`;
    return (
        <button
            type="button"
            className={`${styles.activityRow} ${isSelected ? styles.activityRowSelected : ''}`}
            aria-label={actionLabel}
            onClick={() => onToggle(activity)}
        >
            <span className={`${styles.selectionControl} ${isSingleSelect ? styles.radioControl : ''}`}>
                {isSelected ? '✓' : ''}
            </span>
            <div className={styles.activityContent}>
                <span className={styles.activityName}>{isCopyMode ? `Copy ${activity.name}` : activity.name}</span>
                {breadcrumb || activity.type ? (
                    <span className={styles.activityMeta}>
                        {breadcrumb ? `${breadcrumb}${activity.type ? ' / ' : ''}` : ''}
                        {activity.type || ''}
                    </span>
                ) : null}
                {details}
            </div>
            <CountBadge count={count} />
        </button>
    );
}

/** A browsable activity group, optionally selectable as a whole. */
export function ActivityPickerGroupCard({
    group,
    hasChildren,
    count,
    selectedCount,
    isLinked,
    itemLabelSingular,
    itemLabelPlural,
    allowGroupSelection,
    groupSelectedLabel,
    groupSelectionLabel,
    onBrowse,
    onToggle,
}) {
    return (
        <div className={`${styles.groupCard} ${isLinked || selectedCount > 0 ? styles.groupCardSelected : ''}`}>
            <button
                type="button"
                aria-label={group.name}
                className={styles.groupBrowseButton}
                onClick={() => onBrowse(group.id)}
            >
                <span className={styles.groupName}>{group.name} {hasChildren ? '›' : ''}</span>
                <span className={styles.groupMeta}>
                    {count} {count === 1 ? itemLabelSingular : itemLabelPlural}
                    {selectedCount > 0 && <span>{selectedCount} selected</span>}
                </span>
            </button>
            {allowGroupSelection && (
                <button
                    type="button"
                    className={`${styles.groupSelectButton} ${isLinked ? styles.groupSelectButtonActive : ''}`}
                    onClick={() => onToggle(group)}
                >
                    {isLinked ? `✓ ${groupSelectedLabel}` : groupSelectionLabel}
                </button>
            )}
        </div>
    );
}
