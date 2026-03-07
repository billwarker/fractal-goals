import React, { useState } from 'react';
import styles from './ActivitySearchWidget.module.css';

/**
 * A generic widget for discovering and selecting activities.
 * Merges selection features from ActivityAssociator and TemplateBuilder.
 */
function ActivitySearchWidget({
    activities = [],
    activityGroups = [],
    preSelectedActivityIds = [],
    onConfirm,
    onCancel,
    title = "Select Activities",
    confirmText = "Add Selected",
    allowGroupSelection = false, // If true, allow selecting entire groups
    extraActions = null, // React node for extra buttons (like Create Group)
}) {
    const [selectedActivities, setSelectedActivities] = useState([...preSelectedActivityIds]);
    const [selectedGroups, setSelectedGroups] = useState([]); // Whole group selections
    const [selectedGroupId, setSelectedGroupId] = useState(null); // null = top level, 'ungrouped' = ungrouped, otherwise group ID

    const handleToggleActivity = (activityId) => {
        setSelectedActivities(prev =>
            prev.includes(activityId)
                ? prev.filter(id => id !== activityId)
                : [...prev, activityId]
        );
    };

    const handleToggleGroup = (groupId, groupActivities) => {
        const isSelected = selectedGroups.includes(groupId);
        if (isSelected) {
            setSelectedGroups(prev => prev.filter(id => id !== groupId));
            // Also deselect all activities in this group
            setSelectedActivities(prev => prev.filter(id => !groupActivities.some(a => a.id === id)));
        } else {
            setSelectedGroups(prev => [...prev, groupId]);
            // Select all activities in this group
            setSelectedActivities(prev => [...new Set([...prev, ...groupActivities.map(a => a.id)])]);
        }
    };

    const handleConfirm = () => {
        onConfirm(selectedActivities, selectedGroups);
    };

    // Calculate grouping sizes
    const ungroupedActs = activities.filter(a => !a.group_id);
    const selectedCountInUngrouped = ungroupedActs.filter(a => selectedActivities.includes(a.id)).length;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                {selectedGroupId ? (
                    <button
                        className={styles.backButton}
                        onClick={() => setSelectedGroupId(null)}
                    >
                        ← Back to Groups
                    </button>
                ) : (
                    <h3 className={styles.title}>{title}</h3>
                )}
            </div>

            <div className={styles.content}>
                {!selectedGroupId ? (
                    // MODE: GROUP SELECTION
                    <div className={styles.groupsGrid}>
                        {activityGroups.map(group => {
                            const groupActivities = activities.filter(a => a.group_id === group.id);
                            if (groupActivities.length === 0) return null; // Hide empty

                            const selectedCount = groupActivities.filter(a => selectedActivities.includes(a.id)).length;

                            return (
                                <div
                                    key={group.id}
                                    className={`${styles.groupCard} ${selectedCount > 0 ? styles.groupCardHasSelection : ''}`}
                                >
                                    <div
                                        className={styles.groupCardClickableArea}
                                        onClick={() => setSelectedGroupId(group.id)}
                                    >
                                        <h4 className={styles.groupName}>{group.name}</h4>
                                        <div className={styles.groupMeta}>{groupActivities.length} activities</div>
                                        {selectedCount > 0 && (
                                            <div className={styles.groupSelectedText}>{selectedCount} selected</div>
                                        )}
                                    </div>
                                    {allowGroupSelection && (
                                        <button
                                            className={`${styles.groupSelectBtn} ${selectedGroups.includes(group.id) ? styles.groupSelectBtnActive : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleGroup(group.id, groupActivities);
                                            }}
                                        >
                                            {selectedGroups.includes(group.id) ? '✓ Linked' : 'Link Group'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {ungroupedActs.length > 0 && (
                            <div
                                className={`${styles.groupCard} ${styles.ungroupedCard} ${selectedCountInUngrouped > 0 ? styles.groupCardHasSelection : ''}`}
                                onClick={() => setSelectedGroupId('ungrouped')}
                            >
                                <h4 className={styles.groupName}>Ungrouped</h4>
                                <div className={styles.groupMeta}>{ungroupedActs.length} activities</div>
                                {selectedCountInUngrouped > 0 && (
                                    <div className={styles.groupSelectedText}>{selectedCountInUngrouped} selected</div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    // MODE: ACTIVITY SELECTION (Inside Group)
                    <div className={styles.activityList}>
                        <div className={styles.activeGroupName}>
                            {selectedGroupId === 'ungrouped'
                                ? 'Ungrouped Activities'
                                : activityGroups.find(g => g.id === selectedGroupId)?.name}
                        </div>
                        {activities
                            .filter(a => selectedGroupId === 'ungrouped' ? !a.group_id : a.group_id === selectedGroupId)
                            .map(activity => {
                                const isSelected = selectedActivities.includes(activity.id);
                                return (
                                    <div
                                        key={activity.id}
                                        onClick={() => handleToggleActivity(activity.id)}
                                        className={`${styles.activityRow} ${isSelected ? styles.activityRowSelected : ''}`}
                                    >
                                        <div className={styles.checkbox}>{isSelected && '✓'}</div>
                                        <div className={styles.activityInfo}>
                                            <div className={styles.activityRowName}>{activity.name}</div>
                                            {activity.type && <div className={styles.activityRowType}>{activity.type}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            <div className={styles.actionsBar}>
                <div className={styles.extraActions}>
                    {extraActions}
                </div>
                <div className={styles.actions}>
                    <button className={styles.btnCancel} onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className={styles.btnConfirm}
                        onClick={handleConfirm}
                        disabled={selectedActivities.length === 0 && selectedGroups.length === 0}
                    >
                        {confirmText} ({(selectedActivities.length + selectedGroups.length) > 0 ? selectedActivities.length : '0'})
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ActivitySearchWidget;
