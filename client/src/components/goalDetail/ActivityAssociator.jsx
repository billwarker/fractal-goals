import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOptionalActivities } from '../../contexts/ActivitiesContext';
import { useGoalAssociations } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { sortGroupsTreeOrder } from '../../utils/manageActivities';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import { ActivityPicker } from '../activityPicker';
import notify from '../../utils/notify';
import ActivityGroupContainer from './ActivityGroupContainer';
import ActivityMiniCard from './ActivityMiniCard';
import InlineGroupCreator from './InlineGroupCreator';
import { useActivityAssociatorDerivedData } from './useActivityAssociatorDerivedData';
import styles from './ActivityAssociator.module.css';
import { logError } from '../../utils/logger';

const collectGroupIds = (groups = []) => {
    const ids = [];
    const visit = (group) => {
        if (!group?.id) return;
        ids.push(group.id);
        (group.children || []).forEach(visit);
    };

    groups.forEach(visit);
    return ids;
};

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
    conditionActivityId = null,
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
    onRefreshAssociations,
    embedded = false,
    useFooterAssociateAction = false,
    registerAssociateAction,
    registerAssociateCancelAction,
    onAssociationFlowChange,
    registerPickerFooterActions,
    dividerColor,
    onCopyActivity,
    readOnly = false,
}) => {
    const activityActions = useOptionalActivities();
    const createActivityGroup = activityActions?.createActivityGroup;

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
    // A goal has one activity group; choosing another asks before replacing it.
    const [pendingGroupReplacement, setPendingGroupReplacement] = useState(null);
    const wasDiscoveryActiveRef = useRef(false);
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

    useEffect(() => {
        if (!useFooterAssociateAction || !registerAssociateAction) {
            return undefined;
        }

        registerAssociateAction(() => setIsDiscoveryActive(true));
        return () => registerAssociateAction(null);
    }, [registerAssociateAction, useFooterAssociateAction]);

    useEffect(() => {
        onAssociationFlowChange?.(isDiscoveryActive);
    }, [isDiscoveryActive, onAssociationFlowChange]);

    useEffect(() => {
        if (!useFooterAssociateAction || !registerAssociateCancelAction) {
            return undefined;
        }

        registerAssociateCancelAction(() => setIsDiscoveryActive(false));
        return () => registerAssociateCancelAction(null);
    }, [registerAssociateCancelAction, useFooterAssociateAction]);

    // HANDLERS
    const toggleGroupCollapse = (groupId) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    // The group's subtree: activities linked through it leave with it.
    const getGroupSubtreeIds = useCallback((groupId) => {
        const ids = new Set([groupId]);
        const queue = [groupId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            (activityGroups || []).forEach((candidate) => {
                if (candidate.parent_id === currentId && !ids.has(candidate.id)) {
                    ids.add(candidate.id);
                    queue.push(candidate.id);
                }
            });
        }
        return ids;
    }, [activityGroups]);

    const withoutGroupLinkedActivities = useCallback((activities, groupId) => {
        const subtreeIds = getGroupSubtreeIds(groupId);
        return activities.filter((activity) => !activity?.from_linked_group || !subtreeIds.has(activity.group_id));
    }, [getGroupSubtreeIds]);

    /** Make `group` the goal's one activity group, replacing (and unlinking the activities of) any other. */
    const applyGroupSelection = useCallback(async (group, activities = associatedActivitiesRef.current || []) => {
        const currentGroup = (associatedGroupsRef.current || [])[0] || null;
        const nextActivities = currentGroup && currentGroup.id !== group.id
            ? withoutGroupLinkedActivities(activities, currentGroup.id)
            : activities;
        const finalGroups = [group];
        setAssociatedActivityGroups?.(finalGroups);
        associatedGroupsRef.current = finalGroups;
        setAssociatedActivities(nextActivities);
        associatedActivitiesRef.current = nextActivities;
        if (onSave) await onSave(nextActivities, finalGroups);
    }, [onSave, setAssociatedActivities, setAssociatedActivityGroups, withoutGroupLinkedActivities]);

    const handleConfirmGroupReplacement = async () => {
        const replacement = pendingGroupReplacement;
        setPendingGroupReplacement(null);
        if (!replacement) return;
        await applyGroupSelection(replacement.toGroup, replacement.activities);
        notify.success(`Replaced "${replacement.fromGroup.name}" with "${replacement.toGroup.name}"`);
    };

    const handleConfirmActivitySelection = useCallback(async (selectedActivitiesArg, selectedGroupsArg) => {
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

        setTempSelectedActivities([]);
        setTempSelectedGroups([]);
        setIsDiscoveryActive(false);

        const nextGroup = finalSelectedGroups
            .map(id => activityGroups.find(g => g.id === id))
            .find(Boolean);
        const currentGroup = latestGroups[0] || null;
        if (nextGroup && currentGroup && currentGroup.id !== nextGroup.id) {
            // Picked activities persist now; the group (and what it brought) waits for confirmation.
            const nextGroupIds = getGroupSubtreeIds(nextGroup.id);
            const latestIds = new Set(latestActivities.map((activity) => activity.id));
            const withoutNextGroup = unique.filter((activity) => latestIds.has(activity.id) || !nextGroupIds.has(activity.group_id));
            setAssociatedActivities(withoutNextGroup);
            associatedActivitiesRef.current = withoutNextGroup;
            if (onSave) await onSave(withoutNextGroup, latestGroups);
            setPendingGroupReplacement({ fromGroup: currentGroup, toGroup: nextGroup, activities: unique });
            const addedCount = withoutNextGroup.length - latestActivities.length;
            if (addedCount > 0) notify.success(`Added ${addedCount} activit${addedCount === 1 ? 'y' : 'ies'}`);
            return;
        }
        setAssociatedActivities(unique);
        associatedActivitiesRef.current = unique;
        if (nextGroup && nextGroup.id !== currentGroup?.id) {
            await applyGroupSelection(nextGroup, unique);
        } else if (onSave) {
            // PERSIST if onSave is provided (View Mode persistence)
            await onSave(unique, latestGroups);
        }

        const parts = [];
        if (newActivities.length > 0) parts.push(`${newActivities.length} activit${newActivities.length === 1 ? 'y' : 'ies'}`);
        if (nextGroup && nextGroup.id !== currentGroup?.id) parts.push(`the group "${nextGroup.name}"`);
        if (parts.length > 0) notify.success(`Added ${parts.join(' and ')}`);
    }, [
        activityDefinitions,
        activityGroups,
        applyGroupSelection,
        getGroupSubtreeIds,
        onSave,
        setAssociatedActivities,
        tempSelectedActivities,
        tempSelectedGroups,
    ]);

    const handlePickerCancel = useCallback(() => {
        setIsDiscoveryActive(false);
    }, []);

    const handlePickerCreateGroup = useCallback(() => {
        setShowGroupCreator((current) => !current);
    }, []);

    const handlePickerChange = useCallback(({ activityIds, groupIds }) => {
        setTempSelectedActivities(activityIds);
        setTempSelectedGroups(groupIds);
    }, []);

    const handlePickerConfirm = useCallback(({ activityIds, groupIds }) => {
        handleConfirmActivitySelection(activityIds, groupIds);
    }, [handleConfirmActivitySelection]);

    const executeRemoveActivity = async (activity) => {
        const activityId = activity?.id;
        if (!activityId) return;

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

        if (remainsInherited) {
            const sourceLabel = activity.inherited_from_children && activity.inherited_from_parent
                ? 'other goals'
                : activity.inherited_from_children
                    ? 'a child goal'
                    : 'the parent goal';
            notify.success(`Direct association removed. "${activity.name}" remains inherited from ${sourceLabel}.`);
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

        if (conditionActivityId && activityId === conditionActivityId) {
            setPendingActivityRemoval({ activityId });
            return;
        }

        await executeRemoveActivity(activity);
    };

    const handleConfirmActivityRemoval = async () => {
        if (!pendingActivityRemoval?.activityId) return;

        const { activityId } = pendingActivityRemoval;
        const activity = associatedActivities.find((item) => item.id === activityId);
        await executeRemoveActivity(activity);
        setPendingActivityRemoval(null);
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            notify.error('Please enter a group name');
            return;
        }
        if (readOnly || !createActivityGroup) {
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

            // Link the new group to this goal (create mode buffers it until the goal is saved).
            if (result && result.id) {
                const currentGroup = (associatedGroupsRef.current || [])[0] || null;
                if (currentGroup && currentGroup.id !== result.id) {
                    setPendingGroupReplacement({ fromGroup: currentGroup, toGroup: result });
                } else {
                    await applyGroupSelection(result);
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
            logError('Failed to create activity group', error);
            notify.error('Failed to create group');
        } finally {
            setIsCreatingGroup(false);
        }
    };

    const handleInheritFromParentChange = async (checked) => {
        if (readOnly || !setInheritParentActivities) {
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
            logError('Failed to update parent activity inheritance', err);
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

    const availableActivityDefinitions = useMemo(
        () => activityDefinitions.filter(a => !associatedActivities.some(aa => aa.id === a.id)),
        [activityDefinitions, associatedActivities]
    );

    useEffect(() => {
        if (isDiscoveryActive && !wasDiscoveryActiveRef.current) {
            setCollapsedGroups(new Set(collectGroupIds(roots)));
        }
        wasDiscoveryActiveRef.current = isDiscoveryActive;
    }, [isDiscoveryActive, roots]);

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

        const nextGroups = associatedActivityGroups.filter(g => g.id !== group.id);
        const nextActivities = withoutGroupLinkedActivities(associatedActivities, group.id);

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
            readOnly={readOnly}
        />
    );

    // Determine if we're in "selector" mode (full pane) or "list" mode (inline in edit form)
    const isSelectorMode = !!onCloseSelector || embedded;

    return (
        <div
            className={styles.container}
            style={{
                '--activity-associator-accent': headerColor || 'var(--color-text-primary)',
                '--activity-associator-divider': dividerColor || headerColor || 'var(--color-text-primary)',
            }}
        >
            <Modal
                isOpen={!readOnly && !!pendingGroupReplacement}
                onClose={() => setPendingGroupReplacement(null)}
                title="Replace Activity Group?"
                size="sm"
                showCloseButton={true}
            >
                <p className={styles.removeModalText}>
                    A goal has one activity group. Replace “{pendingGroupReplacement?.fromGroup?.name}” with
                    “{pendingGroupReplacement?.toGroup?.name}”? Activities from “{pendingGroupReplacement?.fromGroup?.name}”
                    stop counting toward this goal unless they are linked on their own.
                </p>
                <div className={styles.removeModalActions}>
                    <Button variant="secondary" onClick={() => setPendingGroupReplacement(null)}>
                        Keep Current Group
                    </Button>
                    <Button variant="primary" onClick={handleConfirmGroupReplacement}>
                        Replace Group
                    </Button>
                </div>
            </Modal>

            <Modal
                isOpen={!readOnly && !!pendingActivityRemoval}
                onClose={() => setPendingActivityRemoval(null)}
                title="Remove Activity?"
                size="sm"
                showCloseButton={true}
            >
                <p className={styles.removeModalText}>
                    This goal completes on this activity. Once it’s unlinked, its sessions stop counting
                    toward the goal unless you link them one by one.
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
                    {!readOnly && onOpenSelector && (
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
                <div className={`${styles.header} ${embedded ? styles.embeddedHeader : ''}`}>
                    {!embedded && (
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
                                    <CloseButton onClick={onClose} className={styles.closeBtn} size={16} />
                                )}
                            </div>
                        </div>
                    )}

                    <div className={styles.metricsBreakdown}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.total}</span>
                            <span className={styles.metricLabel}>Total</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.direct}</span>
                            <span className={styles.metricLabel}>
                                <span className={styles.metricLabelFull}>Directly Associated</span>
                                <span className={styles.metricLabelCompact}>Direct</span>
                            </span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.inheritedFromChildren}</span>
                            <span className={styles.metricLabel}>
                                <span className={styles.metricLabelFull}>Inherited From Children</span>
                                <span className={styles.metricLabelCompact}>Children</span>
                            </span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.inheritedFromParent}</span>
                            <div className={styles.metricLabelRow}>
                                <span className={styles.metricLabel}>
                                    <span className={styles.metricLabelFull}>Inherited From Parent</span>
                                    <span className={styles.metricLabelCompact}>Parent</span>
                                </span>
                                {parentGoalId && (
                                    <label className={styles.inheritCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={inheritParentActivities}
                                            onChange={(e) => handleInheritFromParentChange(e.target.checked)}
                                            className={styles.inheritCheckboxInput}
                                            disabled={readOnly}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {/* ============ DISCOVERY AREA (selector mode only) ============ */}
            {isSelectorMode && isDiscoveryActive && !readOnly && (
                <div className={styles.discoveryWrapper}>
                    <ActivityPicker
                        activities={availableActivityDefinitions}
                        activityGroups={activityGroups}
                        selectedActivityIds={tempSelectedActivities}
                        selectedGroupIds={tempSelectedGroups}
                        selectionMode="multiple"
                        allowActivitySelection
                        allowGroupSelection={true}
                        singleGroupSelection
                        allowCreateActivity={Boolean(onCreateActivity)}
                        allowCopyActivity={Boolean(onCopyActivity)}
                        allowCreateGroup
                        showFooter={!useFooterAssociateAction}
                        registerFooterActions={useFooterAssociateAction ? registerPickerFooterActions : undefined}
                        title="Available Activities & Groups"
                        confirmLabel="Add Selected"
                        onCancel={handlePickerCancel}
                        onCreateActivity={onCreateActivity}
                        onCopyActivity={onCopyActivity}
                        onCreateGroup={handlePickerCreateGroup}
                        onChange={handlePickerChange}
                        onConfirm={handlePickerConfirm}
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
                                readOnly={readOnly}
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
                                {readOnly
                                    ? 'No activities are associated with this goal.'
                                    : 'No activities associated yet. Click below to browse and add activities.'}
                            </div>
                        )
            )}

            {/* ============ ASSOCIATE BUTTON (selector mode only) ============ */}
            {isSelectorMode && !isDiscoveryActive && !useFooterAssociateAction && !readOnly && (
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
        </div>
    );
};

export default ActivityAssociator;
