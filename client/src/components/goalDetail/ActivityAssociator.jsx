import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoalAssociations } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { sortGroupsTreeOrder } from '../../utils/manageActivities';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import ActivitySearchWidget from '../common/ActivitySearchWidget';
import notify from '../../utils/notify';
import ActivityGroupContainer from './ActivityGroupContainer';
import ActivityMiniCard from './ActivityMiniCard';
import InlineGroupCreator from './InlineGroupCreator';
import { useActivityAssociatorDerivedData } from './useActivityAssociatorDerivedData';
import styles from './ActivityAssociator.module.css';

/**
 * ActivityAssociator Component
 * 
 * Manages associated activities for a goal ("SMART Achievable").
 * Uses a card-based layout that mirrors the ManageActivities page design.
 * Features:
 * - Display associated activities in hierarchical groups (with sub-groups)
 * - Display inherited activities (read-only, dashed border)
 * - Discovery mode with browsable group hierarchy
 * - Associate entire groups at once
 * - Create new activity groups inline
 */
const ActivityAssociator = ({
    associatedActivities,
    setAssociatedActivities,
    associatedActivityGroups = [],
    setAssociatedActivityGroups,
    activityDefinitions,
    activityGroups,
    setActivityGroups,
    targets,
    setTargets,
    rootId,
    goalId,
    parentGoalId,
    onOpenSelector,
    onCloseSelector,
    onCreateActivity,
    completedViaChildren = false,
    isAboveShortTermGoal = false,
    headerColor,
    inheritParentActivities = false,
    setInheritParentActivities,
    onClose,
    onSave,
    onRefreshAssociations
}) => {
    const { createActivityGroup, setActivityGroupGoals } = useActivities();

    // STATE
    const [isDiscoveryActive, setIsDiscoveryActive] = useState(false);
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);
    const [tempSelectedGroups, setTempSelectedGroups] = useState([]); // Whole-group selection
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    // Group creation inline form
    const [showGroupCreator, setShowGroupCreator] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupParentId, setNewGroupParentId] = useState('');
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [pendingActivityRemoval, setPendingActivityRemoval] = useState(null);
    const linkedGroupIds = useMemo(
        () => new Set((associatedActivityGroups || []).map(g => g.id)),
        [associatedActivityGroups]
    );
    const associatedActivitiesRef = useRef(associatedActivities);
    const associatedGroupsRef = useRef(associatedActivityGroups);
    const shouldPreviewParentActivities = Boolean(!goalId && inheritParentActivities && rootId && parentGoalId);
    const { activities: fetchedParentActivities = [] } = useGoalAssociations(
        shouldPreviewParentActivities ? rootId : null,
        shouldPreviewParentActivities ? parentGoalId : null
    );
    const previewParentActivities = useMemo(
        () => (fetchedParentActivities || [])
            .filter((activity) => activity.has_direct_association !== false)
            .map((activity) => ({
                ...activity,
                has_direct_association: false,
                inherited_from_parent: true,
                is_inherited: true,
                source_goal_name: 'Parent Goal',
                source_goal_id: parentGoalId || null,
            })),
        [fetchedParentActivities, parentGoalId]
    );

    useEffect(() => {
        associatedActivitiesRef.current = associatedActivities;
    }, [associatedActivities]);

    useEffect(() => {
        associatedGroupsRef.current = associatedActivityGroups;
    }, [associatedActivityGroups]);

    useEffect(() => {
        if (!isDiscoveryActive) {
            setTempSelectedActivities([]);
            setTempSelectedGroups([]);
            setShowGroupCreator(false);
            setNewGroupName('');
            setNewGroupParentId('');
        }
    }, [isDiscoveryActive, activityGroups]);

    // HANDLERS
    const toggleGroupCollapse = (groupId) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleConfirmActivitySelection = async (selectedActivitiesArg, selectedGroupsArg) => {
        // Fallback to state if arguments are not provided (though ActivitySearchWidget should provide them)
        const finalSelectedActivities = selectedActivitiesArg || tempSelectedActivities;
        const finalSelectedGroups = selectedGroupsArg || tempSelectedGroups;

        const newActivities = finalSelectedActivities.map(id =>
            activityDefinitions.find(d => d.id === id)
        ).filter(Boolean);

        const latestActivities = Array.isArray(associatedActivitiesRef.current) ? associatedActivitiesRef.current : [];
        const latestGroups = Array.isArray(associatedGroupsRef.current) ? associatedGroupsRef.current : [];
        const updated = [...latestActivities, ...newActivities];
        const unique = Array.from(new Map(updated.map(item => [item.id, item])).values());

        // Also associate selected groups
        let finalGroups = latestGroups;
        if (finalSelectedGroups.length > 0 && setAssociatedActivityGroups) {
            const newGroups = finalSelectedGroups
                .map(id => activityGroups.find(g => g.id === id))
                .filter(Boolean);
            const updatedGroups = [...latestGroups, ...newGroups];
            finalGroups = Array.from(new Map(updatedGroups.map(g => [g.id, g])).values());
            setAssociatedActivityGroups(finalGroups);
        }

        setAssociatedActivities(unique);
        setTempSelectedActivities([]);
        setTempSelectedGroups([]);
        setIsDiscoveryActive(false);

        // PERSIST if onSave is provided (View Mode persistence)
        if (onSave) {
            await onSave(unique, finalGroups);
        }

        const parts = [];
        if (newActivities.length > 0) parts.push(`${newActivities.length} activit${newActivities.length === 1 ? 'y' : 'ies'}`);
        if (finalSelectedGroups.length > 0) parts.push(`${finalSelectedGroups.length} group${finalSelectedGroups.length === 1 ? '' : 's'}`);
        if (parts.length > 0) notify.success(`Added ${parts.join(' and ')}`);
    };

    const executeRemoveActivity = async (activity, removedTargetsCount = 0) => {
        const activityId = activity?.id;
        if (!activityId) return;

        const dependentTargets = Array.isArray(targets)
            ? targets.filter(t => t.activity_id === activityId)
            : [];

        const remainsInherited = Boolean(activity.inherited_from_children || activity.inherited_from_parent);
        const next = remainsInherited
            ? associatedActivities.map((item) => {
                if (item.id !== activityId) return item;

                return {
                    ...item,
                    has_direct_association: false,
                    is_inherited: true,
                    inherited_from_children: Boolean(item.inherited_from_children),
                    inherited_from_parent: Boolean(item.inherited_from_parent),
                    source_goal_name: item.inherited_from_children
                        ? (item.inherited_source_goal_names?.[0] || item.source_goal_name || 'Child Goal')
                        : (item.inherited_from_parent ? 'Parent Goal' : item.source_goal_name),
                    source_goal_id: item.inherited_from_children
                        ? (item.inherited_source_goal_ids?.[0] || item.source_goal_id || null)
                        : (item.inherited_from_parent ? (parentGoalId || item.source_goal_id || null) : item.source_goal_id),
                };
            })
            : associatedActivities.filter((item) => item.id !== activityId);
        setAssociatedActivities(next);

        if (onSave) {
            await onSave(next, associatedActivityGroups);
            if (remainsInherited && onRefreshAssociations) {
                await onRefreshAssociations();
            }
        }

        const countForToast = removedTargetsCount || dependentTargets.length;
        if (remainsInherited) {
            const sourceLabel = activity.inherited_from_children && activity.inherited_from_parent
                ? 'other goals'
                : activity.inherited_from_children
                    ? 'a child goal'
                    : 'the parent goal';
            notify.success(`Direct association removed. "${activity.name}" remains inherited from ${sourceLabel}.`);
        } else if (countForToast > 0) {
            notify.success(`Activity association removed and ${countForToast} target${countForToast === 1 ? '' : 's'} deleted`);
        } else {
            notify.success("Activity association removed");
        }
    };

    const handleRemoveActivity = async (activityId) => {
        const activity = associatedActivities.find(a => a.id === activityId);
        if (activity && isActivityProtectedByLinkedGroup(activity)) {
            const groupName = resolveLinkedGroupNameForActivity(activity);
            notify.error(
                `Cannot remove "${activity.name}" directly because it is included via linked activity group` +
                `${groupName ? ` "${groupName}"` : ''}. Unlink the group first.`
            );
            return;
        }

        const dependentTargets = Array.isArray(targets)
            ? targets.filter(t => t.activity_id === activityId)
            : [];

        if (dependentTargets.length > 0) {
            setPendingActivityRemoval({
                activityId,
                dependentTargetsCount: dependentTargets.length
            });
            return;
        }

        await executeRemoveActivity(activity);
    };

    const handleConfirmActivityRemoval = async () => {
        if (!pendingActivityRemoval?.activityId) return;

        const { activityId, dependentTargetsCount } = pendingActivityRemoval;
        if (setTargets) {
            setTargets(prev => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter(t => t.activity_id !== activityId);
            });
        }

        const activity = associatedActivities.find((item) => item.id === activityId);
        await executeRemoveActivity(activity, dependentTargetsCount);
        setPendingActivityRemoval(null);
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            notify.error('Please enter a group name');
            return;
        }
        setIsCreatingGroup(true);
        try {
            const trimmedName = newGroupName.trim();
            const data = {
                name: trimmedName,
                parent_id: newGroupParentId || null
            };
            const result = await createActivityGroup(rootId, data);

            // Auto-associate this group with the current goal
            if (result && result.id) {
                if (goalId) {
                    // Goal exists: persist association immediately
                    await setActivityGroupGoals(rootId, result.id, [goalId]);
                    if (onRefreshAssociations) {
                        await onRefreshAssociations();
                    }
                }

                // Always buffer in local state (for both create mode and view mode)
                const currentGroups = Array.isArray(associatedGroupsRef.current) ? associatedGroupsRef.current : [];
                const finalGroups = currentGroups.some(g => g.id === result.id)
                    ? currentGroups
                    : [...currentGroups, result];
                if (setAssociatedActivityGroups) {
                    setAssociatedActivityGroups(finalGroups);
                }
                associatedGroupsRef.current = finalGroups;
                if (goalId && onSave) {
                    await onSave(associatedActivitiesRef.current || [], finalGroups);
                }
            }

            if (setActivityGroups && result) {
                setActivityGroups((prev = []) => {
                    if (!Array.isArray(prev)) return [result];
                    if (prev.some((group) => group.id === result.id)) return prev;
                    return sortGroupsTreeOrder([...prev, result]);
                });
            }

            notify.success(`Created group "${trimmedName}"`);
            setNewGroupName('');
            setNewGroupParentId('');
            setShowGroupCreator(false);
        } catch (error) {
            console.error('Failed to create activity group', error);
            notify.error('Failed to create group');
        } finally {
            setIsCreatingGroup(false);
        }
    };

    const handleInheritFromParentChange = async (checked) => {
        if (!setInheritParentActivities) {
            return;
        }

        const latestActivities = Array.isArray(associatedActivitiesRef.current) ? associatedActivitiesRef.current : [];
        setInheritParentActivities(checked);

        if (!goalId || !rootId) {
            if (!checked) {
                const nextActivities = latestActivities
                    .filter((activity) => activity.has_direct_association !== false || !activity.inherited_from_parent)
                    .map((activity) => (
                        activity.has_direct_association !== false
                            ? { ...activity, inherited_from_parent: false }
                            : activity
                    ));
                setAssociatedActivities(nextActivities);
            }
            return;
        }

        try {
            await fractalApi.updateGoal(rootId, goalId, {
                inherit_parent_activities: checked,
            });
            if (onRefreshAssociations) {
                await onRefreshAssociations();
            }
            notify.success(checked ? 'Enabled parent activity inheritance' : 'Disabled parent activity inheritance');
        } catch (err) {
            setInheritParentActivities(!checked);
            console.error('Failed to update parent activity inheritance', err);
            notify.error('Failed to update parent activity inheritance');
        }
    };

    const {
        counts,
        eligibleParentGroups,
        groupBreadcrumb,
        groupsById,
        roots,
        ungrouped,
    } = useActivityAssociatorDerivedData({
        activityGroups,
        associatedActivities,
        associatedActivityGroups,
        previewParentActivities,
        parentGoalId,
    });

    const resolveLinkedGroupNameForActivity = (activity) => {
        let cursorId = activity?.group_id;
        const seen = new Set();
        while (cursorId && !seen.has(cursorId)) {
            seen.add(cursorId);
            const group = groupsById.get(cursorId);
            if (!group) break;
            if (linkedGroupIds.has(group.id)) return group.name;
            cursorId = group.parent_id;
        }
        return null;
    };

    const isActivityProtectedByLinkedGroup = (activity) => {
        if (!activity) return false;
        if (activity.from_linked_group) return true;

        let cursorId = activity.group_id;
        const seen = new Set();
        while (cursorId && !seen.has(cursorId)) {
            seen.add(cursorId);
            if (linkedGroupIds.has(cursorId)) return true;
            const group = groupsById.get(cursorId);
            if (!group) break;
            cursorId = group.parent_id;
        }
        return false;
    };

    const handleUnlinkGroup = async (group) => {
        if (!group?.id) return;

        const descendantIds = new Set([group.id]);
        const queue = [group.id];
        while (queue.length > 0) {
            const currentId = queue.shift();
            (activityGroups || []).forEach((candidate) => {
                if (candidate.parent_id === currentId && !descendantIds.has(candidate.id)) {
                    descendantIds.add(candidate.id);
                    queue.push(candidate.id);
                }
            });
        }

        const nextGroups = associatedActivityGroups.filter(g => g.id !== group.id);
        const nextActivities = associatedActivities.filter((activity) => {
            if (!activity?.from_linked_group) return true;
            return !descendantIds.has(activity.group_id);
        });

        setAssociatedActivityGroups(nextGroups);
        setAssociatedActivities(nextActivities);

        if (onSave) {
            await onSave(nextActivities, nextGroups);
        }

        notify.success(`Unlinked activity group "${group.name}"`);
    };

    const renderMetricIndicators = useCallback((activity) => {
        const metrics = activity.metric_definitions || [];
        const hasSets = activity.has_sets;

        if (metrics.length === 0 && !hasSets) return null;

        return (
            <div className={styles.indicatorList}>
                {hasSets && (
                    <span className={`${styles.indicator} ${styles.indicatorSets}`}>Sets</span>
                )}
                {metrics.map(m => (
                    <span key={m.id} className={`${styles.indicator} ${styles.indicatorMetric}`}>
                        {m.name} ({m.unit})
                    </span>
                ))}
            </div>
        );
    }, []);

    const renderActivityCard = (activity) => (
        <ActivityMiniCard
            key={activity.id}
            activity={activity}
            isProtectedByGroup={isActivityProtectedByLinkedGroup(activity)}
            onRemove={handleRemoveActivity}
            renderMetricIndicators={renderMetricIndicators}
        />
    );

    // Determine if we're in "selector" mode (full pane) or "list" mode (inline in edit form)
    const isSelectorMode = !!onCloseSelector;

    return (
        <div
            className={styles.container}
            style={{ '--activity-associator-accent': headerColor || 'var(--color-text-primary)' }}
        >
            <Modal
                isOpen={!!pendingActivityRemoval}
                onClose={() => setPendingActivityRemoval(null)}
                title="Remove Activity?"
                size="sm"
                showCloseButton={true}
            >
                <p className={styles.removeModalText}>
                    This activity is used by {pendingActivityRemoval?.dependentTargetsCount || 0} target{(pendingActivityRemoval?.dependentTargetsCount || 0) === 1 ? '' : 's'}.
                    Removing the activity will also delete those target{(pendingActivityRemoval?.dependentTargetsCount || 0) === 1 ? '' : 's'}.
                </p>
                <div className={styles.removeModalActions}>
                    <Button variant="secondary" onClick={() => setPendingActivityRemoval(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={handleConfirmActivityRemoval}>
                        Remove Activity
                    </Button>
                </div>
            </Modal>

            {/* ============ INLINE SECTION HEADER (list mode in edit form) ============ */}
            {!isSelectorMode && (
                <div className={styles.inlineSectionHeader}>
                    <div className={styles.inlineSectionHeaderLeft}>
                        <span className={styles.inlineSectionLabel}>
                            Associated Activities
                        </span>
                        {counts.total > 0 && (
                            <span className={styles.inlineSectionCount}>
                                {counts.total}
                            </span>
                        )}
                    </div>
                    {onOpenSelector && (
                        <button
                            onClick={onOpenSelector}
                            className={styles.inlineAssociateBtn}
                        >
                            + Associate Activities
                        </button>
                    )}
                </div>
            )}

            {/* ============ STICKY HEADER (selector mode only) ============ */}
            {isSelectorMode && (
                <div className={styles.header}>
                    <div className={styles.headerTopLine}>
                        <div className={styles.headerLeft}>
                            <button
                                onClick={onCloseSelector}
                                className={styles.backBtn}
                                title="Back to Goal"
                            >
                                ←
                            </button>
                        </div>
                        <h3 className={styles.headerTitle}>
                            Associated Activities
                        </h3>
                        <div className={styles.headerRight}>
                            {onClose && (
                                <button onClick={onClose} className={styles.closeBtn}>×</button>
                            )}
                        </div>
                    </div>

                    <div className={styles.metricsBreakdown}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.total}</span>
                            <span className={styles.metricLabel}>Total</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.direct}</span>
                            <span className={styles.metricLabel}>Directly Associated</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.inheritedFromChildren}</span>
                            <span className={styles.metricLabel}>Inherited From Children</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.inheritedFromParent}</span>
                            <div className={styles.metricLabelRow}>
                                <span className={styles.metricLabel}>Inherited From Parent</span>
                                {parentGoalId && (
                                    <label className={styles.inheritCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={inheritParentActivities}
                                            onChange={(e) => handleInheritFromParentChange(e.target.checked)}
                                            className={styles.inheritCheckboxInput}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {/* ============ ASSOCIATED ACTIVITIES (selector mode only) ============ */}
            {isSelectorMode && (
                (roots.length > 0 || ungrouped.activities.length > 0) ? (
                    <div className={styles.associatedActivitiesList}>
                        {roots.map((group) => (
                            <ActivityGroupContainer
                                key={group.id}
                                group={group}
                                associatedActivityGroups={associatedActivityGroups}
                                collapsedGroups={collapsedGroups}
                                onToggleCollapse={toggleGroupCollapse}
                                onUnlinkGroup={handleUnlinkGroup}
                                renderActivityCard={renderActivityCard}
                            />
                        ))}

                        {ungrouped.activities.length > 0 && (
                            <div className={styles.ungroupedContainer}>
                                <h4 className={styles.ungroupedTitle}>Ungrouped</h4>
                                <div className={styles.activityGrid}>
                                    {ungrouped.activities.map(renderActivityCard)}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        No activities associated yet. Click below to browse and add activities.
                    </div>
                )
            )}

            {/* ============ ASSOCIATE BUTTON (selector mode only) ============ */}
            {isSelectorMode && !isDiscoveryActive && (
                <div className={styles.associateActions}>
                    <button
                        type="button"
                        onClick={() => setIsDiscoveryActive(true)}
                        className={styles.associateBtn}
                    >
                        + Associate Activities
                    </button>
                </div>
            )}

            {/* ============ COMPLETION VIA CHILDREN NOTE (selector mode only) ============ */}
            {isSelectorMode && counts.total === 0 && isAboveShortTermGoal && !completedViaChildren && (
                <div className={styles.helperNote}>
                    (Goal implies completion via children unless activities are added)
                </div>
            )}

            {/* ============ DISCOVERY AREA (selector mode only) ============ */}
            {isSelectorMode && isDiscoveryActive && (
                    <div className={styles.discoveryWrapper}>
                    <ActivitySearchWidget
                        activities={activityDefinitions.filter(a => !associatedActivities.some(aa => aa.id === a.id))}
                        activityGroups={activityGroups}
                        preSelectedActivityIds={tempSelectedActivities}
                        allowGroupSelection={true}
                        title="Available Activities & Groups"
                        onConfirm={handleConfirmActivitySelection}
                        onCancel={() => setIsDiscoveryActive(false)}
                        extraActions={
                            <>
                                <button
                                    onClick={() => onCreateActivity && onCreateActivity()}
                                    className={styles.createLink}
                                >
                                    + Create New Activity
                                </button>
                                <button
                                    onClick={() => setShowGroupCreator(!showGroupCreator)}
                                    className={styles.createLink}
                                >
                                    + Create New Group
                                </button>
                            </>
                        }
                    />

                    {/* Inline Group Creator overlay over search widget */}
                    {showGroupCreator && (
                        <InlineGroupCreator
                            eligibleParentGroups={eligibleParentGroups}
                            groupBreadcrumb={groupBreadcrumb}
                            isCreatingGroup={isCreatingGroup}
                            newGroupName={newGroupName}
                            newGroupParentId={newGroupParentId}
                            onCancel={() => setShowGroupCreator(false)}
                            onCreate={handleCreateGroup}
                            onGroupNameChange={setNewGroupName}
                            onParentChange={setNewGroupParentId}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default ActivityAssociator;
