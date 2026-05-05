import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import CloseIcon from '../atoms/CloseIcon';
import styles from './ActivityFilterModal.module.css';

const ROOT_KEY = '__root__';
const UNGROUPED_KEY = '__ungrouped__';

function sortByOrderThenName(items = []) {
    return [...items].sort((a, b) => {
        if ((a.sort_order || 0) !== (b.sort_order || 0)) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        }
        return (a.name || '').localeCompare(b.name || '');
    });
}

function ActivityFilterModal({
    title = 'Filter by Activity',
    activities = [],
    activityGroups = [],
    initialActivityIds = [],
    initialGroupIds = [],
    onConfirm,
    onClose,
    selectionMode = 'multiple',
    allowGroupSelection = selectionMode === 'multiple',
    activityCounts = {},
    groupCounts = {},
    confirmLabel = 'Apply filters',
}) {
    const [pendingActivityIds, setPendingActivityIds] = useState(new Set(initialActivityIds));
    const [pendingGroupIds, setPendingGroupIds] = useState(
        new Set(allowGroupSelection ? initialGroupIds : [])
    );
    const [browseGroupId, setBrowseGroupId] = useState(null);
    const [searchText, setSearchText] = useState('');

    const isSingleSelect = selectionMode === 'single';
    const isSearching = searchText.trim().length > 0;
    const safeActivities = useMemo(
        () => (Array.isArray(activities) ? activities.filter(Boolean) : []),
        [activities]
    );
    const safeActivityGroups = useMemo(
        () => (Array.isArray(activityGroups) ? activityGroups.filter(Boolean) : []),
        [activityGroups]
    );

    const groupMap = useMemo(() => {
        const map = {};
        safeActivityGroups.forEach((group) => {
            map[group.id] = group;
        });
        return map;
    }, [safeActivityGroups]);

    const normalizedGroups = useMemo(
        () => safeActivityGroups.map((group) => ({
            ...group,
            normalized_parent_id: group.parent_id && groupMap[group.parent_id]
                ? group.parent_id
                : ROOT_KEY,
        })),
        [groupMap, safeActivityGroups]
    );

    const normalizedGroupMap = useMemo(() => {
        const map = {};
        normalizedGroups.forEach((group) => {
            map[group.id] = group;
        });
        return map;
    }, [normalizedGroups]);

    const childGroupsByParent = useMemo(() => {
        const map = {};
        sortByOrderThenName(normalizedGroups).forEach((group) => {
            const parentId = group.normalized_parent_id || ROOT_KEY;
            if (!map[parentId]) {
                map[parentId] = [];
            }
            map[parentId].push(group);
        });
        return map;
    }, [normalizedGroups]);

    const activitiesByGroup = useMemo(() => {
        const map = {};
        sortByOrderThenName(safeActivities).forEach((activity) => {
            const groupId = activity.group_id && groupMap[activity.group_id]
                ? activity.group_id
                : UNGROUPED_KEY;
            if (!map[groupId]) {
                map[groupId] = [];
            }
            map[groupId].push(activity);
        });
        return map;
    }, [groupMap, safeActivities]);

    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
        };

        document.addEventListener('keydown', handleEsc);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const currentGroup = browseGroupId ? normalizedGroupMap[browseGroupId] : null;
    const currentSubGroups = childGroupsByParent[browseGroupId || ROOT_KEY] || [];
    const currentActivities = browseGroupId ? (activitiesByGroup[browseGroupId] || []) : [];
    const ungroupedActivities = activitiesByGroup[UNGROUPED_KEY] || [];

    const searchResults = useMemo(() => {
        if (!isSearching) {
            return null;
        }
        const query = searchText.trim().toLowerCase();
        return sortByOrderThenName(safeActivities).filter(
            (activity) => activity.name.toLowerCase().includes(query)
        );
    }, [isSearching, safeActivities, searchText]);

    const totalSelected = pendingActivityIds.size + pendingGroupIds.size;

    const toggleActivity = (activityId) => {
        setPendingActivityIds((previous) => {
            const next = new Set(previous);
            if (isSingleSelect) {
                if (next.has(activityId) && next.size === 1) {
                    return new Set();
                }
                return new Set([activityId]);
            }

            if (next.has(activityId)) {
                next.delete(activityId);
            } else {
                next.add(activityId);
            }
            return next;
        });
    };

    const toggleGroup = (groupId) => {
        if (!allowGroupSelection) {
            return;
        }

        const directActivities = activitiesByGroup[groupId] || [];
        setPendingGroupIds((previousGroupIds) => {
            const nextGroupIds = new Set(previousGroupIds);
            const nextActivityIds = new Set(pendingActivityIds);

            if (nextGroupIds.has(groupId)) {
                nextGroupIds.delete(groupId);
                directActivities.forEach((activity) => nextActivityIds.delete(activity.id));
            } else {
                nextGroupIds.add(groupId);
                directActivities.forEach((activity) => nextActivityIds.add(activity.id));
            }

            setPendingActivityIds(nextActivityIds);
            return nextGroupIds;
        });
    };

    const handleClear = () => {
        setPendingActivityIds(new Set());
        setPendingGroupIds(new Set());
    };

    const handleApply = () => {
        onConfirm?.([...pendingActivityIds], [...pendingGroupIds]);
        onClose?.();
    };

    const handleBack = () => {
        if (!browseGroupId) {
            return;
        }
        const parentId = normalizedGroupMap[browseGroupId]?.normalized_parent_id;
        setBrowseGroupId(parentId && parentId !== ROOT_KEY ? parentId : null);
    };

    const renderCountBadge = (count) => {
        if (!Number.isFinite(count) || count <= 0) {
            return null;
        }
        return <span className={styles.countBadge}>{count}</span>;
    };

    const showRootEmptyState = !browseGroupId && currentSubGroups.length === 0 && ungroupedActivities.length === 0;
    const showGroupEmptyState = Boolean(browseGroupId) && currentSubGroups.length === 0 && currentActivities.length === 0;

    const modalContent = (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        {browseGroupId && (
                            <button type="button" className={styles.backButton} onClick={handleBack}>
                                ‹
                            </button>
                        )}
                        <h3 className={styles.title}>
                            {currentGroup ? currentGroup.name : title}
                        </h3>
                    </div>
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close activity filter">
                        <CloseIcon size={16} />
                    </button>
                </div>

                <div className={styles.body}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search activities..."
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        autoFocus
                    />

                    {isSearching ? (
                        <div className={styles.activityList}>
                            {searchResults.length > 0 ? (
                                searchResults.map((activity) => {
                                    const isChecked = pendingActivityIds.has(activity.id);
                                    const groupName = activity.group_id && groupMap[activity.group_id]
                                        ? groupMap[activity.group_id].name
                                        : null;
                                    return (
                                        <label key={activity.id} className={styles.activityRow}>
                                            <input
                                                type={isSingleSelect ? 'radio' : 'checkbox'}
                                                name={isSingleSelect ? 'activity-filter-single' : undefined}
                                                checked={isChecked}
                                                onChange={() => toggleActivity(activity.id)}
                                            />
                                            <span className={styles.activityName}>
                                                {groupName && (
                                                    <span className={styles.searchGroupLabel}>{groupName} › </span>
                                                )}
                                                {activity.name}
                                            </span>
                                            {renderCountBadge(activityCounts[activity.id])}
                                        </label>
                                    );
                                })
                            ) : (
                                <div className={styles.emptyState}>No activities match "{searchText}"</div>
                            )}
                        </div>
                    ) : (<>
                    {currentSubGroups.length > 0 && (
                        <div className={styles.groupGrid}>
                            {currentSubGroups.map((group) => {
                                const isChecked = pendingGroupIds.has(group.id);
                                const hasChildren = (childGroupsByParent[group.id] || []).length > 0;
                                return (
                                    <div
                                        key={group.id}
                                        className={[
                                            styles.groupCard,
                                            isChecked ? styles.groupCardChecked : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        {allowGroupSelection ? (
                                            <label
                                                className={styles.groupCheckbox}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleGroup(group.id)}
                                                />
                                            </label>
                                        ) : (
                                            <div className={styles.groupCheckboxSpacer} />
                                        )}
                                        <button
                                            type="button"
                                            className={styles.groupNameButton}
                                            onClick={() => setBrowseGroupId(group.id)}
                                        >
                                            <span>{group.name}</span>
                                            <span className={styles.groupMeta}>
                                                {renderCountBadge(groupCounts[group.id])}
                                                {hasChildren && <span className={styles.arrow}>›</span>}
                                            </span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {currentActivities.length > 0 && (
                        <div className={styles.activityList}>
                            {currentSubGroups.length > 0 && (
                                <div className={styles.sectionHeading}>Activities in this group</div>
                            )}
                            {currentActivities.map((activity) => {
                                const isChecked = pendingActivityIds.has(activity.id);
                                return (
                                    <label key={activity.id} className={styles.activityRow}>
                                        <input
                                            type={isSingleSelect ? 'radio' : 'checkbox'}
                                            name={isSingleSelect ? 'activity-filter-single' : undefined}
                                            checked={isChecked}
                                            onChange={() => toggleActivity(activity.id)}
                                        />
                                        <span className={styles.activityName}>{activity.name}</span>
                                        {renderCountBadge(activityCounts[activity.id])}
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    {!browseGroupId && ungroupedActivities.length > 0 && (
                        <div className={styles.activityList}>
                            <div className={styles.sectionHeading}>Ungrouped</div>
                            {ungroupedActivities.map((activity) => {
                                const isChecked = pendingActivityIds.has(activity.id);
                                return (
                                    <label key={activity.id} className={styles.activityRow}>
                                        <input
                                            type={isSingleSelect ? 'radio' : 'checkbox'}
                                            name={isSingleSelect ? 'activity-filter-single' : undefined}
                                            checked={isChecked}
                                            onChange={() => toggleActivity(activity.id)}
                                        />
                                        <span className={styles.activityName}>{activity.name}</span>
                                        {renderCountBadge(activityCounts[activity.id])}
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    {showRootEmptyState && (
                        <div className={styles.emptyState}>No activities found.</div>
                    )}

                    {showGroupEmptyState && (
                        <div className={styles.emptyState}>No activities found in this group.</div>
                    )}
                    </>)}
                </div>

                <div className={styles.footer}>
                    <span className={styles.footerCount}>
                        {totalSelected > 0 ? `${totalSelected} selected` : 'None selected'}
                    </span>
                    <div className={styles.footerActions}>
                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={handleClear}
                            disabled={totalSelected === 0}
                        >
                            Clear
                        </button>
                        <button type="button" className={styles.applyButton} onClick={handleApply}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (typeof document !== 'undefined') {
        return createPortal(modalContent, document.body);
    }

    return modalContent;
}

export default ActivityFilterModal;
