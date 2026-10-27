import React, { useMemo, useState } from 'react';

import { useActivities, useActivityGroups } from '../../hooks/useActivityQueries';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalTreePicker from '../common/GoalTreePicker';
import styles from './NoteComposer.module.css';

/**
 * ComposeLinkPanel — standalone link panel for use when the panel is hoisted
 * to a parent column (e.g. the /notes page right column during compose mode).
 * Shares one grouped activity browser and goal picker across compose layouts.
 */
export default function ComposeLinkPanel({
    rootId,
    selectedGoalId,
    selectedActivityId,
    onGoalSelect,
    onActivitySelect,
}) {
    const [linkTab, setLinkTab] = useState('goal');
    const [browseGroupId, setBrowseGroupId] = useState(null);
    const { data: treeData } = useFractalTree(rootId);
    const { activities = [] } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    const groupMap = useMemo(() => Object.fromEntries(activityGroups.map(g => [g.id, g])), [activityGroups]);
    const childGroupsByParent = useMemo(() => {
        const m = {};
        activityGroups.forEach(g => {
            const pid = g.parent_id || '__root__';
            if (!m[pid]) m[pid] = [];
            m[pid].push(g);
        });
        return m;
    }, [activityGroups]);
    const activitiesByGroup = useMemo(() => {
        const m = {};
        activities.forEach(a => {
            const gid = a.group_id || '__ungrouped__';
            if (!m[gid]) m[gid] = [];
            m[gid].push(a);
        });
        return m;
    }, [activities]);

    const currentGroup = browseGroupId ? groupMap[browseGroupId] : null;
    const currentSubGroups = childGroupsByParent[browseGroupId || '__root__'] || [];
    const currentActivities = activitiesByGroup[browseGroupId] || [];

    const toggleActivity = (activity) => {
        const isDeselect = selectedActivityId === activity.id;
        onActivitySelect(isDeselect ? null : activity.id, isDeselect ? null : activity.name);
    };

    const handleBack = () => {
        const parent = groupMap[browseGroupId]?.parent_id || null;
        setBrowseGroupId(parent);
    };

    return (
        <div className={styles.standaloneLinkPanel}>
            <div className={styles.linkTabs}>
                <button
                    className={[styles.linkTab, linkTab === 'goal' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setLinkTab('goal')}
                    type="button"
                >
                    Goal
                </button>
                <button
                    className={[styles.linkTab, linkTab === 'activity' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setLinkTab('activity')}
                    type="button"
                >
                    Activity
                </button>
            </div>
            <div className={styles.standaloneLinkPanelContent}>
                {linkTab === 'goal' && (
                    <div className={styles.goalTree}>
                        <GoalTreePicker
                            treeData={treeData}
                            selectedGoalIds={selectedGoalId ? [selectedGoalId] : []}
                            onSelectionChange={(ids, names) => {
                                onGoalSelect(ids[0] || null, names[0] || null);
                            }}
                            showHideCompleted={true}
                            allowLineageSelection={false}
                            getGoalColor={getGoalColor}
                            getGoalIcon={getGoalIcon}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                        />
                    </div>
                )}
                {linkTab === 'activity' && (
                    <div className={styles.activityBrowser}>
                        {/* breadcrumb / back */}
                        {browseGroupId && (
                            <div className={styles.activityBrowserNav}>
                                <button className={styles.activityBrowserBack} onClick={handleBack} type="button">
                                    ‹ {currentGroup?.name || 'Back'}
                                </button>
                            </div>
                        )}

                        {/* sub-groups */}
                        {currentSubGroups.length > 0 && (
                            <div className={styles.activityGroupList}>
                                {currentSubGroups.map(group => {
                                    const actCount = (activitiesByGroup[group.id] || []).length;
                                    const hasChildren = (childGroupsByParent[group.id] || []).length > 0;
                                    return (
                                        <button
                                            key={group.id}
                                            className={styles.activityGroupRow}
                                            onClick={() => setBrowseGroupId(group.id)}
                                            type="button"
                                        >
                                            <span>{group.name}</span>
                                            <span className={styles.activityGroupMeta}>
                                                {hasChildren ? '›' : `${actCount}`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* activities */}
                        {currentActivities.length > 0 && (
                            <div className={styles.activityCheckList}>
                                {currentSubGroups.length > 0 && (
                                    <div className={styles.activityCheckListDivider}>Activities</div>
                                )}
                                {currentActivities.map(activity => (
                                    <label key={activity.id} className={styles.activityCheckRow}>
                                        <input
                                            type="checkbox"
                                            checked={selectedActivityId === activity.id}
                                            onChange={() => toggleActivity(activity)}
                                        />
                                        <span className={styles.activityCheckName}>{activity.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {/* ungrouped at root */}
                        {!browseGroupId && (activitiesByGroup['__ungrouped__'] || []).length > 0 && (
                            <div className={styles.activityCheckList}>
                                <div className={styles.activityCheckListDivider}>Ungrouped</div>
                                {(activitiesByGroup['__ungrouped__'] || []).map(activity => (
                                    <label key={activity.id} className={styles.activityCheckRow}>
                                        <input
                                            type="checkbox"
                                            checked={selectedActivityId === activity.id}
                                            onChange={() => toggleActivity(activity)}
                                        />
                                        <span className={styles.activityCheckName}>{activity.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {currentSubGroups.length === 0 && currentActivities.length === 0 && !browseGroupId && (
                            <span className={styles.activityEmpty}>No activities found.</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

