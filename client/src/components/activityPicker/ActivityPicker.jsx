import React, { useCallback, useEffect, useMemo, useState } from 'react';

import CloseButton from '../atoms/CloseButton';
import {
    ROOT_KEY,
    buildActivityPickerModel,
} from './activityPickerUtils';
import styles from './ActivityPicker.module.css';

const COPY_MODE = 'copy';
const PICK_MODE = 'pick';

function toSet(value) {
    return new Set(Array.isArray(value) ? value.filter(Boolean) : []);
}

function ActivityPicker({
    activities = [],
    activityGroups = [],
    title = 'Select Activity',
    searchPlaceholder = 'Search activities...',
    selectionMode = 'multiple',
    selectedActivityIds = [],
    selectedGroupIds = [],
    initialBrowseGroupId = null,
    allowActivitySelection = true,
    allowGroupSelection = false,
    allowCreateActivity = false,
    allowCopyActivity = false,
    allowCreateGroup = false,
    closeOnSelect = false,
    showHeader = true,
    showFooter = true,
    showSearch = true,
    showCloseButton = true,
    showPrimaryActions = true,
    showRootBackButton = true,
    variant = 'panel',
    confirmLabel = 'Apply',
    cancelLabel = 'Cancel',
    clearLabel = 'Clear',
    groupSelectionLabel = 'Link Group',
    groupSelectedLabel = 'Linked',
    counts = {},
    onChange,
    onConfirm,
    onCancel,
    onClose,
    onCreateActivity,
    onCopyActivity,
    onCreateGroup,
    extraActions = null,
    registerFooterActions,
}) {
    const [pendingActivityIds, setPendingActivityIds] = useState(() => toSet(selectedActivityIds));
    const [pendingGroupIds, setPendingGroupIds] = useState(() => toSet(selectedGroupIds));
    const [manualBrowseGroupId, setManualBrowseGroupId] = useState(undefined);
    const [searchText, setSearchText] = useState('');
    const [pickerMode, setPickerMode] = useState(PICK_MODE);

    const isSingleSelect = selectionMode === 'single';
    const isCopyMode = allowCopyActivity && pickerMode === COPY_MODE;

    const model = useMemo(
        () => buildActivityPickerModel(activities, activityGroups),
        [activities, activityGroups]
    );
    const browseGroupId = manualBrowseGroupId === undefined
        ? (initialBrowseGroupId && model.normalizedGroupMap[initialBrowseGroupId] ? initialBrowseGroupId : null)
        : manualBrowseGroupId;

    const selectedActivities = useMemo(
        () => model.activities.filter((activity) => pendingActivityIds.has(activity.id)),
        [model.activities, pendingActivityIds]
    );

    const selectedGroups = useMemo(
        () => model.activityGroups.filter((group) => pendingGroupIds.has(group.id)),
        [model.activityGroups, pendingGroupIds]
    );

    const publishChange = useCallback((activityIds, groupIds) => {
        onChange?.({
            activityIds: [...activityIds],
            groupIds: [...groupIds],
            activities: model.activities.filter((activity) => activityIds.has(activity.id)),
            groups: model.activityGroups.filter((group) => groupIds.has(group.id)),
        });
    }, [model.activities, model.activityGroups, onChange]);

    const toggleActivity = (activity) => {
        if (!allowActivitySelection || !activity?.id) return;
        if (isCopyMode) {
            onCopyActivity?.(activity);
            return;
        }

        let nextActivityIds;
        if (isSingleSelect) {
            nextActivityIds = pendingActivityIds.has(activity.id) && pendingActivityIds.size === 1
                ? new Set()
                : new Set([activity.id]);
        } else {
            nextActivityIds = new Set(pendingActivityIds);
            if (nextActivityIds.has(activity.id)) {
                nextActivityIds.delete(activity.id);
            } else {
                nextActivityIds.add(activity.id);
            }
        }

        setPendingActivityIds(nextActivityIds);
        publishChange(nextActivityIds, pendingGroupIds);

        if (closeOnSelect) {
            onConfirm?.({
                activityIds: [...nextActivityIds],
                groupIds: [...pendingGroupIds],
                activities: model.activities.filter((item) => nextActivityIds.has(item.id)),
                groups: selectedGroups,
            });
            onClose?.();
        }
    };

    const toggleGroup = (group) => {
        if (!allowGroupSelection || !group?.id) return;

        const nextGroupIds = new Set(pendingGroupIds);
        const nextActivityIds = new Set(pendingActivityIds);
        const groupActivityIds = model.getActivityIdsForGroup(group.id);

        if (nextGroupIds.has(group.id)) {
            nextGroupIds.delete(group.id);
            groupActivityIds.forEach((activityId) => nextActivityIds.delete(activityId));
        } else {
            nextGroupIds.add(group.id);
            groupActivityIds.forEach((activityId) => nextActivityIds.add(activityId));
        }

        setPendingGroupIds(nextGroupIds);
        setPendingActivityIds(nextActivityIds);
        publishChange(nextActivityIds, nextGroupIds);
    };

    const handleClear = useCallback(() => {
        const nextActivityIds = new Set();
        const nextGroupIds = new Set();
        setPendingActivityIds(nextActivityIds);
        setPendingGroupIds(nextGroupIds);
        publishChange(nextActivityIds, nextGroupIds);
    }, [publishChange]);

    const handleConfirm = useCallback(() => {
        onConfirm?.({
            activityIds: [...pendingActivityIds],
            groupIds: [...pendingGroupIds],
            activities: selectedActivities,
            groups: selectedGroups,
        });
    }, [onConfirm, pendingActivityIds, pendingGroupIds, selectedActivities, selectedGroups]);

    const handleToggleCopyMode = useCallback(() => {
        setPickerMode((mode) => (mode === COPY_MODE ? PICK_MODE : COPY_MODE));
    }, []);

    const handleBack = () => {
        if (!browseGroupId) {
            onCancel?.();
            onClose?.();
            return;
        }
        const parentId = model.normalizedGroupMap[browseGroupId]?.normalized_parent_id;
        setManualBrowseGroupId(parentId && parentId !== ROOT_KEY ? parentId : null);
    };

    const query = searchText.trim().toLowerCase();
    const isSearching = query.length > 0;
    const currentGroup = browseGroupId ? model.normalizedGroupMap[browseGroupId] : null;
    const currentGroups = model.childGroupsByParent[browseGroupId || ROOT_KEY] || [];
    const currentActivities = browseGroupId ? (model.activitiesByGroup[browseGroupId] || []) : [];
    const rootUngroupedActivities = !browseGroupId ? model.ungroupedActivities : [];
    const searchResults = useMemo(() => {
        if (!isSearching) return [];
        return model.searchActivities(query);
    }, [isSearching, model, query]);

    const totalSelected = pendingActivityIds.size + pendingGroupIds.size;
    const selectedSummary = totalSelected > 0
        ? [
            pendingActivityIds.size ? `${pendingActivityIds.size} activit${pendingActivityIds.size === 1 ? 'y' : 'ies'}` : null,
            pendingGroupIds.size ? `${pendingGroupIds.size} group${pendingGroupIds.size === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(', ')
        : 'None selected';

    useEffect(() => {
        if (!registerFooterActions) {
            return undefined;
        }

        registerFooterActions({
            selectedSummary,
            totalSelected,
            clearLabel,
            cancelLabel,
            confirmLabel: selectionMode === 'multiple'
                ? `${confirmLabel} (${selectedSummary})`
                : confirmLabel,
            canClear: totalSelected > 0,
            canConfirm: totalSelected > 0,
            onClear: handleClear,
            onCancel,
            onConfirm: handleConfirm,
        });

        return () => registerFooterActions(null);
    }, [
        cancelLabel,
        clearLabel,
        confirmLabel,
        handleClear,
        handleConfirm,
        onCancel,
        registerFooterActions,
        selectedSummary,
        selectionMode,
        totalSelected,
    ]);

    const displayTitle = currentGroup ? currentGroup.name : title;
    const subtitle = currentGroup
        ? model.getBreadcrumb(currentGroup.id).map((group) => group.name).join(' / ')
        : null;

    const renderCountBadge = (count) => {
        if (!Number.isFinite(count) || count <= 0) return null;
        return <span className={styles.countBadge}>{count}</span>;
    };

    const renderActivity = (activity) => {
        const isSelected = pendingActivityIds.has(activity.id);
        const groupBreadcrumb = activity.group_id
            ? model.getBreadcrumb(activity.group_id).map((item) => item.name).join(' / ')
            : '';
        const activityActionLabel = isCopyMode
            ? `Copy ${activity.name}`
            : `${isSelected ? 'Deselect' : 'Select'} ${activity.name}`;
        return (
            <button
                type="button"
                key={activity.id}
                className={`${styles.activityRow} ${isSelected ? styles.activityRowSelected : ''}`}
                aria-label={activityActionLabel}
                onClick={() => toggleActivity(activity)}
            >
                <span className={`${styles.selectionControl} ${isSingleSelect ? styles.radioControl : ''}`}>
                    {isSelected ? '✓' : ''}
                </span>
                <span>
                    <span className={styles.activityName}>{isCopyMode ? `Copy ${activity.name}` : activity.name}</span>
                    {(isSearching && groupBreadcrumb) || activity.type ? (
                        <span className={styles.activityMeta}>
                            {isSearching && groupBreadcrumb ? `${groupBreadcrumb}${activity.type ? ' / ' : ''}` : ''}
                            {activity.type || ''}
                        </span>
                    ) : null}
                </span>
                {renderCountBadge(counts.activitiesById?.[activity.id] ?? counts.activityCounts?.[activity.id]) || <span />}
            </button>
        );
    };

    const renderGroup = (group) => {
        const hasChildren = (model.childGroupsByParent[group.id] || []).length > 0;
        const count = model.recursiveActivityCounts[group.id] || 0;
        const selectedCount = model.getActivityIdsForGroup(group.id)
            .filter((activityId) => pendingActivityIds.has(activityId)).length;
        const isLinked = pendingGroupIds.has(group.id);

        if (count === 0) return null;

        return (
            <div
                key={group.id}
                className={`${styles.groupCard} ${isLinked || selectedCount > 0 ? styles.groupCardSelected : ''}`}
            >
                <button
                    type="button"
                    aria-label={group.name}
                    className={styles.groupBrowseButton}
                    onClick={() => setManualBrowseGroupId(group.id)}
                >
                    <span className={styles.groupName}>{group.name} {hasChildren ? '›' : ''}</span>
                    <span className={styles.groupMeta}>
                        {count} activit{count === 1 ? 'y' : 'ies'}
                        {selectedCount > 0 && <span>{selectedCount} selected</span>}
                    </span>
                </button>
                {allowGroupSelection && (
                    <button
                        type="button"
                        className={`${styles.groupSelectButton} ${isLinked ? styles.groupSelectButtonActive : ''}`}
                        onClick={() => toggleGroup(group)}
                    >
                        {isLinked ? `✓ ${groupSelectedLabel}` : groupSelectionLabel}
                    </button>
                )}
            </div>
        );
    };

    const showEmpty = !isSearching
        && currentGroups.length === 0
        && currentActivities.length === 0
        && rootUngroupedActivities.length === 0;

    return (
        <div className={`${styles.picker} ${variant === 'panel' ? styles.panel : ''}`}>
            <div className={styles.body}>
                {showHeader && (
                    <div className={styles.header}>
                        <div className={styles.titleBlock}>
                            <h3 className={styles.title}>{displayTitle}</h3>
                            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
                            {isCopyMode && (
                                <div className={styles.subtitle}>
                                    Copy mode: select an existing activity definition to duplicate into a new one.
                                </div>
                            )}
                        </div>
                        <div className={styles.headerActions}>
                            {(browseGroupId || (showRootBackButton && variant === 'panel' && (onCancel || onClose))) && (
                                <button type="button" className={styles.backButton} onClick={handleBack}>
                                    ← Back
                                </button>
                            )}
                            {showCloseButton && onClose && (
                                <CloseButton className={styles.closeButton} onClick={onClose} aria-label="Close activity picker" size={14} />
                            )}
                        </div>
                    </div>
                )}

                {showSearch && (
                    <input
                        className={styles.searchInput}
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder={searchPlaceholder}
                    />
                )}

                {isSearching ? (
                    <div className={styles.activityList}>
                        {searchResults.length > 0
                            ? searchResults.map(renderActivity)
                            : <div className={styles.emptyState}>No activities match "{searchText}"</div>}
                    </div>
                ) : (
                    <>
                        {currentGroups.length > 0 && (
                            <div className={styles.groupGrid}>
                                {currentGroups.map(renderGroup)}
                            </div>
                        )}

                        {currentActivities.length > 0 && (
                            <div className={styles.activityList}>
                                {currentGroups.length > 0 && <div className={styles.sectionHeading}>Activities in this group</div>}
                                {currentActivities.map(renderActivity)}
                            </div>
                        )}

                        {!browseGroupId && rootUngroupedActivities.length > 0 && (
                            <>
                                <div className={styles.sectionHeading}>Ungrouped</div>
                                <div className={styles.activityList}>
                                    {rootUngroupedActivities.map(renderActivity)}
                                </div>
                            </>
                        )}

                        {showEmpty && <div className={styles.emptyState}>No activities found.</div>}
                    </>
                )}

                {showPrimaryActions && (allowCreateActivity || allowCopyActivity || allowCreateGroup || extraActions) && (
                    <>
                        <div className={styles.divider} />
                        <div className={styles.primaryActions}>
                            {allowCreateActivity && (
                                <button type="button" className={styles.secondaryAction} onClick={onCreateActivity}>
                                    + Create New Activity Definition
                                </button>
                            )}
                            {allowCopyActivity && (
                                <button
                                    type="button"
                                    className={`${styles.secondaryAction} ${isCopyMode ? styles.secondaryActionActive : ''}`}
                                    onClick={handleToggleCopyMode}
                                >
                                    {isCopyMode ? 'Cancel Copy Mode' : '+ Copy Existing Activity Definition'}
                                </button>
                            )}
                            {allowCreateGroup && (
                                <button type="button" className={styles.secondaryAction} onClick={onCreateGroup}>
                                    + Create New Group
                                </button>
                            )}
                            {extraActions}
                        </div>
                    </>
                )}
            </div>

            {showFooter && (
                <div className={styles.footer}>
                    <div className={styles.footerSummary}>{selectedSummary}</div>
                    <div className={styles.footerActions}>
                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={handleClear}
                            disabled={totalSelected === 0}
                        >
                            {clearLabel}
                        </button>
                        {onCancel && (
                            <button type="button" className={styles.cancelButton} onClick={onCancel}>
                                {cancelLabel}
                            </button>
                        )}
                        <button
                            type="button"
                            className={styles.confirmButton}
                            onClick={handleConfirm}
                            disabled={totalSelected === 0}
                        >
                            {confirmLabel} {selectionMode === 'multiple' ? `(${totalSelected})` : ''}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ActivityPicker;
