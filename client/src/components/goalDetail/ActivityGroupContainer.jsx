import React from 'react';

import styles from './ActivityAssociator.module.css';

const ActivityGroupContainer = ({
    group,
    associatedActivityGroups,
    collapsedGroups,
    isNested = false,
    onToggleCollapse,
    onUnlinkGroup,
    renderActivityCard,
}) => {
    const children = group.children || [];
    const groupActivities = group.activities || [];
    const isCollapsed = collapsedGroups.has(group.id);
    const isLinked = associatedActivityGroups.some((candidate) => candidate.id === group.id);
    const activityCount = group.totalCount !== undefined ? group.totalCount : groupActivities.length;

    return (
        <div className={`${styles.groupContainer} ${isNested ? styles.groupContainerNested : ''}`}>
            <div className={styles.groupHeader} onClick={() => onToggleCollapse(group.id)}>
                <div className={styles.groupHeaderLeft}>
                    <button className={styles.collapseBtn} tabIndex={-1}>
                        {isCollapsed ? '+' : '−'}
                    </button>
                    <h4 className={styles.groupName}>{group.name}</h4>
                    <span className={styles.groupCount}>
                        ({activityCount})
                    </span>
                </div>
                <div className={styles.groupHeaderActions}>
                    {isLinked && (
                        <>
                            <span className={styles.groupBadge}>Linked</span>
                            <button
                                type="button"
                                className={styles.groupUnlinkBtn}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onUnlinkGroup(group);
                                }}
                                title={`Unlink group "${group.name}"`}
                            >
                                Unlink
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!isCollapsed && (
                <>
                    {children.length > 0 && (
                        <div className={styles.nestedGroupChildren}>
                            {children.map((child) => (
                                <ActivityGroupContainer
                                    key={child.id}
                                    group={child}
                                    associatedActivityGroups={associatedActivityGroups}
                                    collapsedGroups={collapsedGroups}
                                    isNested={true}
                                    onToggleCollapse={onToggleCollapse}
                                    onUnlinkGroup={onUnlinkGroup}
                                    renderActivityCard={renderActivityCard}
                                />
                            ))}
                        </div>
                    )}
                    {groupActivities.length > 0 && (
                        <div className={styles.activityGrid}>
                            {groupActivities.map((activity) => renderActivityCard(activity))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ActivityGroupContainer;
