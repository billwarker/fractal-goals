import React from 'react';

import Switch from '../atoms/Switch';
import styles from './ActivityAssociator.module.css';

const ActivityGroupContainer = ({
    group,
    associatedActivityGroups,
    collapsedGroups,
    isNested = false,
    linkedAncestorName = null,
    onToggleCollapse,
    onLinkGroup,
    onUnlinkGroup,
    renderActivityCard,
    readOnly = false,
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
                    {(isLinked || (!readOnly && !linkedAncestorName)) && (
                        <label
                            className={styles.groupLinkToggle}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <span className={`${styles.groupBadge} ${isLinked ? '' : styles.groupBadgeOff}`}>
                                {isLinked ? 'Linked' : 'Unlinked'}
                            </span>
                            <Switch
                                checked={isLinked}
                                disabled={readOnly}
                                className={styles.groupSwitch}
                                onChange={(checked) => (checked ? onLinkGroup(group) : onUnlinkGroup(group))}
                                aria-label={`Link group "${group.name}" to this goal`}
                                title={readOnly ? undefined : `${isLinked ? 'Unlink' : 'Link'} group "${group.name}"`}
                            />
                        </label>
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
                                    linkedAncestorName={isLinked ? group.name : linkedAncestorName}
                                    onToggleCollapse={onToggleCollapse}
                                    onLinkGroup={onLinkGroup}
                                    onUnlinkGroup={onUnlinkGroup}
                                    renderActivityCard={renderActivityCard}
                                    readOnly={readOnly}
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
