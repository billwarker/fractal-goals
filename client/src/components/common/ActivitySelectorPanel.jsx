import React, { useMemo, useState } from 'react';

import styles from './ActivitySelectorPanel.module.css';

const SELECTOR_MODES = {
    ADD: 'add',
    COPY: 'copy',
};

function buildGroupMap(activityGroups) {
    return (Array.isArray(activityGroups) ? activityGroups : []).reduce((map, group) => {
        map[group.id] = group;
        return map;
    }, {});
}

export default function ActivitySelectorPanel({
    activities = [],
    activityGroups = [],
    onClose,
    onSelectActivity,
    onCreateActivityDefinition,
    onCopyActivityDefinition,
    allowCreate = false,
    allowCopy = false,
    closeOnSelect = false,
}) {
    const [browseParentGroupId, setBrowseParentGroupId] = useState(null);
    const [activeLeafGroupId, setActiveLeafGroupId] = useState(null);
    const [selectorMode, setSelectorMode] = useState(SELECTOR_MODES.ADD);

    const groupMap = useMemo(() => buildGroupMap(activityGroups), [activityGroups]);
    const groupedActivities = useMemo(() => {
        const map = {};
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (!activity.group_id) return;
            if (!map[activity.group_id]) map[activity.group_id] = [];
            map[activity.group_id].push(activity);
        });
        return map;
    }, [activities]);

    const ungroupedActivities = useMemo(
        () => (Array.isArray(activities) ? activities.filter((activity) => !activity.group_id) : []),
        [activities]
    );

    const childGroupsByParent = useMemo(() => {
        const map = {};
        (Array.isArray(activityGroups) ? activityGroups : []).forEach((group) => {
            const parentId = group.parent_id || null;
            if (!map[parentId]) map[parentId] = [];
            map[parentId].push(group);
        });
        return map;
    }, [activityGroups]);

    const recursiveActivityCounts = useMemo(() => {
        const counts = {};
        const visiting = new Set();

        const computeCount = (groupId) => {
            if (!groupId) return 0;
            if (counts[groupId] != null) return counts[groupId];
            if (visiting.has(groupId)) return 0;
            visiting.add(groupId);

            const direct = groupedActivities[groupId]?.length || 0;
            const children = childGroupsByParent[groupId] || [];
            const nested = children.reduce((sum, child) => sum + computeCount(child.id), 0);
            const total = direct + nested;
            counts[groupId] = total;
            visiting.delete(groupId);
            return total;
        };

        (Array.isArray(activityGroups) ? activityGroups : []).forEach((group) => {
            computeCount(group.id);
        });

        return counts;
    }, [activityGroups, childGroupsByParent, groupedActivities]);

    const currentGroupChoices = useMemo(() => {
        const groups = childGroupsByParent[browseParentGroupId || null] || [];
        return groups.filter((group) => (recursiveActivityCounts[group.id] || 0) > 0);
    }, [browseParentGroupId, childGroupsByParent, recursiveActivityCounts]);

    const currentParentGroup = browseParentGroupId ? groupMap[browseParentGroupId] : null;
    const currentLevelActivities = browseParentGroupId ? (groupedActivities[browseParentGroupId] || []) : [];
    const leafActivities = activeLeafGroupId === 'ungrouped'
        ? ungroupedActivities
        : (groupedActivities[activeLeafGroupId] || []);

    const isCopyMode = allowCopy && selectorMode === SELECTOR_MODES.COPY;

    const resetSelector = () => {
        setBrowseParentGroupId(null);
        setActiveLeafGroupId(null);
        setSelectorMode(SELECTOR_MODES.ADD);
        onClose?.();
    };

    const handleBack = () => {
        if (activeLeafGroupId !== null) {
            setActiveLeafGroupId(null);
            return;
        }
        if (browseParentGroupId) {
            setBrowseParentGroupId(groupMap[browseParentGroupId]?.parent_id || null);
            return;
        }
        resetSelector();
    };

    const handleSelectActivity = (activity) => {
        if (isCopyMode) {
            onCopyActivityDefinition?.(activity);
        } else {
            onSelectActivity?.(activity);
        }

        if (closeOnSelect) {
            resetSelector();
        }
    };

    return (
        <div className={styles.activitySelector}>
            <div className={styles.selectorHeader}>
                <div className={styles.selectorHeaderContent}>
                    <span className={styles.selectorTitle}>
                        {activeLeafGroupId === null
                            ? (browseParentGroupId
                                ? `Step 1: Select Sub-Group in ${currentParentGroup?.name || 'Group'}`
                                : 'Step 1: Select Activity Group')
                            : (activeLeafGroupId === 'ungrouped'
                                ? 'Step 2: Pick an Ungrouped Activity'
                                : `Step 2: Pick a ${groupMap[activeLeafGroupId]?.name || 'Group'} Activity`)
                        }
                    </span>
                    {isCopyMode && (
                        <div className={styles.copyModeHint}>
                            Copy mode: select an existing activity definition to duplicate into a new one.
                        </div>
                    )}
                </div>
                <div className={styles.selectorActions}>
                    <button
                        type="button"
                        onClick={handleBack}
                        className={styles.backButton}
                    >
                        ← Back
                    </button>
                    <button
                        type="button"
                        onClick={resetSelector}
                        className={styles.closeButton}
                        aria-label="Close activity selector"
                    >
                        ×
                    </button>
                </div>
            </div>

            {activeLeafGroupId === null ? (
                <>
                    <div className={styles.groupsGrid}>
                        {currentGroupChoices.map((group) => {
                            const childGroups = childGroupsByParent[group.id] || [];
                            const hasChildren = childGroups.some((child) => (recursiveActivityCounts[child.id] || 0) > 0);
                            const activityCount = recursiveActivityCounts[group.id] || 0;

                            return (
                                <button
                                    type="button"
                                    key={group.id}
                                    onClick={() => {
                                        if (hasChildren) {
                                            setBrowseParentGroupId(group.id);
                                            setActiveLeafGroupId(null);
                                        } else {
                                            setActiveLeafGroupId(group.id);
                                        }
                                    }}
                                    className={styles.groupCard}
                                >
                                    <div className={styles.groupCardName}>
                                        {group?.name || 'Unknown'} {'›'}
                                    </div>
                                    <div className={styles.groupCardCount}>{activityCount} activities</div>
                                </button>
                            );
                        })}

                        {!browseParentGroupId && ungroupedActivities.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setActiveLeafGroupId('ungrouped')}
                                className={styles.ungroupedCard}
                            >
                                <div className={styles.ungroupedCardName}>Ungrouped</div>
                                <div className={styles.groupCardCount}>{ungroupedActivities.length} activities</div>
                            </button>
                        )}
                    </div>

                    {currentLevelActivities.length > 0 && (
                        <>
                            <div className={styles.selectorDivider}></div>
                            <div className={styles.activitiesList}>
                                {currentLevelActivities.map((activity) => (
                                    <button
                                        type="button"
                                        key={activity.id}
                                        onClick={() => handleSelectActivity(activity)}
                                        className={styles.activityButton}
                                    >
                                        <span>{isCopyMode ? 'Copy' : '+'}</span> {activity.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div className={styles.activitiesList}>
                    {leafActivities.map((activity) => (
                        <button
                            type="button"
                            key={activity.id}
                            onClick={() => handleSelectActivity(activity)}
                            className={styles.activityButton}
                        >
                            <span>{isCopyMode ? 'Copy' : '+'}</span> {activity.name}
                        </button>
                    ))}
                    {leafActivities.length === 0 && (
                        <div className={styles.noActivitiesMessage}>No activities found in this group.</div>
                    )}
                </div>
            )}

            {(allowCreate || allowCopy) && activeLeafGroupId === null && (
                <>
                    <div className={styles.selectorDivider}></div>
                    <div className={styles.selectorPrimaryActions}>
                        {allowCreate && (
                            <button
                                type="button"
                                onClick={onCreateActivityDefinition}
                                className={styles.createActivityButton}
                            >
                                + Create New Activity Definition
                            </button>
                        )}
                        {allowCopy && (
                            <button
                                type="button"
                                onClick={() => setSelectorMode((currentMode) => (
                                    currentMode === SELECTOR_MODES.COPY ? SELECTOR_MODES.ADD : SELECTOR_MODES.COPY
                                ))}
                                className={`${styles.createActivityButton} ${isCopyMode ? styles.createActivityButtonActive : ''}`}
                            >
                                {isCopyMode
                                    ? 'Cancel Copy Mode'
                                    : '+ Copy Existing Activity Definition'}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
