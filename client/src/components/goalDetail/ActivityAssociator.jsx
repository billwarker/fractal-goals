import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoalAssociations } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { sortGroupsTreeOrder, getGroupBreadcrumb as sharedGetGroupBreadcrumb } from '../../utils/manageActivities';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import ActivitySearchWidget from '../common/ActivitySearchWidget';
import notify from '../../utils/notify';
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
    goalName,
    isEditing,
    onOpenSelector,
    onCloseSelector,
    onCreateActivity,
    completedViaChildren = false,
    isAboveShortTermGoal = false,
    headerColor,
    goalType,
    onClose,
    onSave,
    onRefreshAssociations
}) => {
    const { createActivityGroup, setActivityGroupGoals, fetchActivityGroups } = useActivities();

    // STATE
    const [isDiscoveryActive, setIsDiscoveryActive] = useState(false);
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);
    const [tempSelectedGroups, setTempSelectedGroups] = useState([]); // Whole-group selection
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [collapsedDiscoveryGroups, setCollapsedDiscoveryGroups] = useState(new Set());

    // Group creation inline form
    const [showGroupCreator, setShowGroupCreator] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupParentId, setNewGroupParentId] = useState('');
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [pendingActivityRemoval, setPendingActivityRemoval] = useState(null);
    const [inheritFromParent, setInheritFromParent] = useState(goalType === 'NanoGoal');
    const [parentActivities, setParentActivities] = useState([]);
    const linkedGroupIds = useMemo(
        () => new Set((associatedActivityGroups || []).map(g => g.id)),
        [associatedActivityGroups]
    );
    const associatedActivitiesRef = useRef(associatedActivities);
    const associatedGroupsRef = useRef(associatedActivityGroups);

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

    const toggleDiscoveryGroupCollapse = (groupId) => {
        setCollapsedDiscoveryGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const toggleActivitySelection = (activityId) => {
        setTempSelectedActivities(prev =>
            prev.includes(activityId) ? prev.filter(id => id !== activityId) : [...prev, activityId]
        );
    };

    // Toggle whole-group selection: selects/deselects all unassociated activities in the group (and sub-groups)
    const toggleGroupSelection = (groupId) => {
        const isSelected = tempSelectedGroups.includes(groupId);

        // Collect all activity IDs in this group and its sub-groups recursively
        const collectGroupActivityIds = (gId) => {
            const ids = activityDefinitions
                .filter(a => a.group_id === gId && !associatedActivities.some(aa => aa.id === a.id))
                .map(a => a.id);
            // Find sub-groups
            const subGroups = activityGroups.filter(g => g.parent_id === gId);
            subGroups.forEach(sg => ids.push(...collectGroupActivityIds(sg.id)));
            return ids;
        };

        const groupActivityIds = collectGroupActivityIds(groupId);

        if (isSelected) {
            // Deselect group and its activities
            setTempSelectedGroups(prev => prev.filter(id => id !== groupId));
            setTempSelectedActivities(prev => prev.filter(id => !groupActivityIds.includes(id)));
        } else {
            // Select group and all its activities
            setTempSelectedGroups(prev => [...prev, groupId]);
            setTempSelectedActivities(prev => {
                const combined = [...prev, ...groupActivityIds];
                return [...new Set(combined)]; // unique
            });
        }
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
        window.dispatchEvent(new CustomEvent('goalAssociationsChanged', {
            detail: { goalId, rootId }
        }));

        const parts = [];
        if (newActivities.length > 0) parts.push(`${newActivities.length} activit${newActivities.length === 1 ? 'y' : 'ies'}`);
        if (finalSelectedGroups.length > 0) parts.push(`${finalSelectedGroups.length} group${finalSelectedGroups.length === 1 ? '' : 's'}`);
        if (parts.length > 0) notify.success(`Added ${parts.join(' and ')}`);
    };

    const executeRemoveActivity = (activityId, removedTargetsCount = 0) => {
        const dependentTargets = Array.isArray(targets)
            ? targets.filter(t => t.activity_id === activityId)
            : [];

        const next = associatedActivities.filter(a => a.id !== activityId);
        setAssociatedActivities(next);

        if (onSave) {
            onSave(next, associatedActivityGroups);
        }

        const countForToast = removedTargetsCount || dependentTargets.length;
        if (countForToast > 0) {
            notify.success(`Activity association removed and ${countForToast} target${countForToast === 1 ? '' : 's'} deleted`);
        } else {
            notify.success("Activity association removed");
        }
        window.dispatchEvent(new CustomEvent('activityAssociationsChanged', {
            detail: { activityId, goalId }
        }));
    };

    const handleRemoveActivity = (activityId) => {
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

        executeRemoveActivity(activityId);
    };

    const handleConfirmActivityRemoval = () => {
        if (!pendingActivityRemoval?.activityId) return;

        const { activityId, dependentTargetsCount } = pendingActivityRemoval;
        if (setTargets) {
            setTargets(prev => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter(t => t.activity_id !== activityId);
            });
        }

        executeRemoveActivity(activityId, dependentTargetsCount);
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
                    window.dispatchEvent(new CustomEvent('goalAssociationsChanged', {
                        detail: { goalId, rootId }
                    }));
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

            // Refresh groups and sync to parent-local state used by this modal
            if (fetchActivityGroups) {
                const refreshedGroups = await fetchActivityGroups(rootId);
                if (setActivityGroups && Array.isArray(refreshedGroups)) {
                    setActivityGroups(refreshedGroups);
                }
            }

            notify.success(`Created group "${trimmedName}"`);
            setNewGroupName('');
            setNewGroupParentId('');
            setShowGroupCreator(false);
        } catch {
            notify.error('Failed to create group');
        } finally {
            setIsCreatingGroup(false);
        }
    };

    // VIEW HELPERS

    // Build hierarchical tree from flat groups list
    const buildGroupTree = (groups) => {
        const map = {};
        groups.forEach(g => {
            map[g.id] = { ...g, children: [] };
        });
        const roots = [];
        groups.forEach(g => {
            if (g.parent_id && map[g.parent_id]) {
                map[g.parent_id].children.push(map[g.id]);
            } else {
                roots.push(map[g.id]);
            }
        });
        roots.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        // Sort children too
        Object.values(map).forEach(g => {
            g.children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        });
        return { roots, map };
    };

    // Compute depth of a group (0 = root, 1 = child, 2 = grandchild)
    const getGroupDepth = (groupId) => {
        let depth = 0;
        let currentId = groupId;
        const seen = new Set();
        while (currentId) {
            if (seen.has(currentId)) break;
            seen.add(currentId);
            const group = (activityGroups || []).find(g => g.id === currentId);
            if (!group || !group.parent_id) break;
            depth++;
            currentId = group.parent_id;
        }
        return depth;
    };

    // Build breadcrumb path using shared utility
    const groupBreadcrumb = (groupId) => sharedGetGroupBreadcrumb(groupId, activityGroups || []);

    // Filter groups eligible as parents for new group creation (max 3 levels = depth <= 1)
    const eligibleParentGroups = useMemo(() => {
        return sortGroupsTreeOrder((activityGroups || []).filter(g => getGroupDepth(g.id) < 2));
    }, [activityGroups]);

    // Fetch parent activities via React Query hook when inherit checkbox is checked
    const { activities: fetchedParentActivities } = useGoalAssociations(
        inheritFromParent ? rootId : null,
        inheritFromParent ? parentGoalId : null
    );

    // Sync fetched activities to the local state
    useEffect(() => {
        if (inheritFromParent) {
            setParentActivities(fetchedParentActivities);
        } else {
            setParentActivities([]);
        }
    }, [inheritFromParent, fetchedParentActivities]);

    const groupsById = useMemo(() => {
        const map = new Map();
        (activityGroups || []).forEach((group) => map.set(group.id, group));
        return map;
    }, [activityGroups]);

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
        window.dispatchEvent(new CustomEvent('goalAssociationsChanged', {
            detail: { goalId, rootId }
        }));

        notify.success(`Unlinked activity group "${group.name}"`);
    };

    // Merge parent activities for display
    const displayActivities = useMemo(() => {
        if (!inheritFromParent || parentActivities.length === 0) return associatedActivities;
        const existing = new Set(associatedActivities.map(a => a.id));
        const inherited = parentActivities
            .filter(a => !existing.has(a.id))
            .map(a => ({ ...a, is_inherited: true, source_goal_name: 'Parent Goal' }));
        return [...associatedActivities, ...inherited];
    }, [associatedActivities, inheritFromParent, parentActivities]);

    // Build the tree of associated activities organized by group
    const buildRelevantTree = () => {
        const relevantGroupIds = new Set();
        associatedActivityGroups.forEach(g => relevantGroupIds.add(g.id));
        displayActivities.forEach(a => {
            if (a.group_id) relevantGroupIds.add(a.group_id);
        });

        // Also add parent groups of relevant groups (for sub-group nesting display)
        const addParents = (groupId) => {
            const group = activityGroups.find(g => g.id === groupId);
            if (group && group.parent_id) {
                relevantGroupIds.add(group.parent_id);
                addParents(group.parent_id);
            }
        };
        [...relevantGroupIds].forEach(id => addParents(id));

        const relevantGroups = activityGroups.filter(g => relevantGroupIds.has(g.id));
        const map = {};
        relevantGroups.forEach(g => {
            map[g.id] = { ...g, children: [], activities: [] };
        });

        const ungrouped = { id: 'ungrouped', name: 'Ungrouped', children: [], activities: [] };

        displayActivities.forEach(a => {
            if (a.group_id && map[a.group_id]) {
                map[a.group_id].activities.push(a);
            } else {
                ungrouped.activities.push(a);
            }
        });

        const roots = [];
        relevantGroups.forEach(g => {
            if (g.parent_id && map[g.parent_id]) {
                map[g.parent_id].children.push(map[g.id]);
            } else {
                roots.push(map[g.id]);
            }
        });

        // Sort
        roots.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        Object.values(map).forEach(g => {
            g.children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        });

        // Calculate total counts recursively
        const attachTotalCount = (node) => {
            node.totalCount = node.activities.length +
                node.children.reduce((sum, child) => sum + attachTotalCount(child), 0);
            return node.totalCount;
        };
        roots.forEach(attachTotalCount);

        return { roots, ungrouped };
    };

    const { roots, ungrouped } = buildRelevantTree();

    // Calculate direct vs inherited counts
    const counts = useMemo(() => {
        let direct = 0;
        let inherited = 0;

        // Count in tree nodes
        const countInNode = (node) => {
            node.activities.forEach(a => {
                if (a.is_inherited) inherited++;
                else direct++;
            });
            node.children.forEach(countInNode);
        };
        roots.forEach(countInNode);

        // Count in ungrouped
        ungrouped.activities.forEach(a => {
            if (a.is_inherited) inherited++;
            else direct++;
        });

        return { direct, inherited };
    }, [roots, ungrouped]);

    // RENDERERS

    const renderMetricIndicators = (activity) => {
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
    };

    const renderMiniCard = (activity) => {
        const isInherited = activity.is_inherited;
        const isProtectedByGroup = !isInherited && isActivityProtectedByLinkedGroup(activity);

        const cardClasses = [
            styles.miniCard,
            isInherited && styles.miniCardInherited,
        ].filter(Boolean).join(' ');

        return (
            <div
                key={activity.id}
                className={cardClasses}
                title={isInherited ? `Inherited from ${activity.source_goal_name}` : activity.name}
            >
                <div className={styles.miniCardHeader}>
                    <h4 className={styles.miniCardName}>
                        {isInherited && (
                            <span className={styles.inheritedIcon} title={`Inherited from ${activity.source_goal_name}`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 10 4 15 9 20"></polyline>
                                    <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
                                </svg>
                            </span>
                        )}
                        {activity.name}
                    </h4>
                    {!isInherited && !isProtectedByGroup && (
                        <button
                            className={styles.removeBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveActivity(activity.id);
                            }}
                            title="Remove association"
                        >
                            ×
                        </button>
                    )}
                </div>
                {isProtectedByGroup && (
                    <span className={styles.groupLinkedNote}>
                        Included via linked group
                    </span>
                )}

                {isInherited && (
                    <span className={styles.inheritedBadge}>
                        inherited
                    </span>
                )}

                {renderMetricIndicators(activity)}
            </div>
        );
    };

    const renderGroupContainer = (group, { isNested = false } = {}) => {
        const children = group.children || [];
        const groupActivities = group.activities || [];
        const isCollapsed = collapsedGroups.has(group.id);

        const isLinked = associatedActivityGroups.some(g => g.id === group.id);

        const activityCount = group.totalCount !== undefined ? group.totalCount : groupActivities.length;

        return (
            <div
                key={group.id}
                className={`${styles.groupContainer} ${isNested ? styles.groupContainerNested : ''}`}
            >
                <div className={styles.groupHeader} onClick={() => toggleGroupCollapse(group.id)}>
                    <div className={styles.groupHeaderLeft}>
                        <button className={styles.collapseBtn} tabIndex={-1}>
                            {isCollapsed ? '+' : '−'}
                        </button>
                        <h4 className={styles.groupName}>{group.name}</h4>
                        <span className={styles.groupCount}>
                            ({activityCount})
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isLinked && (
                            <>
                                <span className={styles.groupBadge}>Linked</span>
                                <button
                                    type="button"
                                    className={styles.groupUnlinkBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlinkGroup(group);
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
                            <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {children.map(child => renderGroupContainer(child, { isNested: true }))}
                            </div>
                        )}
                        {groupActivities.length > 0 && (
                            <div className={styles.activityGrid}>
                                {groupActivities.map(a => renderMiniCard(a))}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    // Determine if we're in "selector" mode (full pane) or "list" mode (inline in edit form)
    const isSelectorMode = !!onCloseSelector;

    return (
        <div className={styles.container}>
            <Modal
                isOpen={!!pendingActivityRemoval}
                onClose={() => setPendingActivityRemoval(null)}
                title="Remove Activity?"
                size="sm"
                showCloseButton={true}
            >
                <p style={{ margin: '0 0 16px 0', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                    This activity is used by {pendingActivityRemoval?.dependentTargetsCount || 0} target{(pendingActivityRemoval?.dependentTargetsCount || 0) === 1 ? '' : 's'}.
                    Removing the activity will also delete those target{(pendingActivityRemoval?.dependentTargetsCount || 0) === 1 ? '' : 's'}.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
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
                        <span className={styles.inlineSectionLabel} style={{ color: headerColor || 'var(--color-text-primary)' }}>
                            Associated Activities
                        </span>
                        {associatedActivities.length > 0 && (
                            <span className={styles.inlineSectionCount}>
                                {associatedActivities.length}
                            </span>
                        )}
                    </div>
                    {onOpenSelector && (
                        <button
                            onClick={onOpenSelector}
                            style={{
                                background: 'transparent',
                                border: '1.5px solid #4caf50',
                                borderRadius: '4px',
                                color: '#4caf50',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                padding: '2px 8px',
                                transition: 'all 0.2s'
                            }}
                        >
                            + Associate Activities
                        </button>
                    )}
                </div>
            )}

            {/* ============ STICKY HEADER (selector mode only) ============ */}
            {isSelectorMode && (
                <div className={styles.header} style={{ borderBottom: `2px solid ${headerColor || 'var(--color-border)'}` }}>
                    <div className={styles.headerTopLine}>
                        <div className={styles.headerLeft}>
                            <button
                                onClick={onCloseSelector}
                                className={styles.backBtn}
                                style={{ color: headerColor || 'var(--color-text-primary)' }}
                                title="Back to Goal"
                            >
                                ←
                            </button>
                        </div>
                        <h3 className={styles.headerTitle} style={{ color: headerColor || 'var(--color-text-primary)' }}>
                            Associated Activities
                        </h3>
                        <div className={styles.headerRight}>
                            {onClose && (
                                <button onClick={onClose} className={styles.closeBtn}>×</button>
                            )}
                        </div>
                    </div>

                    <div className={styles.metricsBreakdown} style={{ color: headerColor || 'var(--color-text-primary)' }}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.direct + counts.inherited}</span>
                            <span className={styles.metricLabel}>Total</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.direct}</span>
                            <span className={styles.metricLabel}>Directly Associated</span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricNumber}>{counts.inherited}</span>
                            <span className={styles.metricLabel}>Inherited</span>
                        </div>
                    </div>

                    {/* Inherit from parent checkbox */}
                    {parentGoalId && (
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 12px',
                            fontSize: '12px', color: 'var(--color-text-secondary)',
                            cursor: 'pointer'
                        }}>
                            <input
                                type="checkbox"
                                checked={inheritFromParent}
                                onChange={async (e) => {
                                    const checked = e.target.checked;
                                    setInheritFromParent(checked);

                                    if (checked && parentGoalId && rootId) {
                                        try {
                                            const res = await fractalApi.getGoalActivities(rootId, parentGoalId);
                                            const parentActs = res.data || [];

                                            if (parentActs.length > 0) {
                                                const existingIds = new Set(associatedActivities.map(a => a.id));
                                                const newActs = parentActs.filter(a => !existingIds.has(a.id));

                                                if (newActs.length > 0) {
                                                    const nextActivities = [...associatedActivities, ...newActs];
                                                    setAssociatedActivities(nextActivities);
                                                    if (onSave) {
                                                        await onSave(nextActivities, associatedActivityGroups);
                                                        notify.success(`Inherited and associated ${newActs.length} activities from parent`);
                                                    } else {
                                                        notify.success(`Queued ${newActs.length} inherited activities for association`);
                                                    }
                                                } else {
                                                    notify.info("All parent activities are already associated");
                                                }
                                            } else {
                                                notify.info("Parent goal has no activities to inherit");
                                            }
                                        } catch (err) {
                                            console.error("Failed to inherit parent activities", err);
                                            notify.error("Failed to inherit parent activities");
                                        }
                                    }
                                }}
                                style={{ accentColor: headerColor || 'var(--color-brand-primary)' }}
                            />
                            Inherit activities from parent goals
                        </label>
                    )}
                </div>
            )}

            {/* ============ ASSOCIATED ACTIVITIES (selector mode only) ============ */}
            {isSelectorMode && (
                (roots.length > 0 || ungrouped.activities.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {roots.map(group => renderGroupContainer(group))}

                        {ungrouped.activities.length > 0 && (
                            <div className={styles.ungroupedContainer}>
                                <h4 className={styles.ungroupedTitle}>Ungrouped</h4>
                                <div className={styles.activityGrid}>
                                    {ungrouped.activities.map(a => renderMiniCard(a))}
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
                <button
                    onClick={() => setIsDiscoveryActive(true)}
                    className={styles.associateBtn}
                >
                    + Associate Activities
                </button>
            )}

            {/* ============ COMPLETION VIA CHILDREN NOTE (selector mode only) ============ */}
            {isSelectorMode && associatedActivities.length === 0 && isAboveShortTermGoal && !completedViaChildren && (
                <div className={styles.helperNote}>
                    (Goal implies completion via children unless activities are added)
                </div>
            )}

            {/* ============ DISCOVERY AREA (selector mode only) ============ */}
            {isSelectorMode && isDiscoveryActive && (
                <div style={{ marginTop: '16px', flex: 1, minHeight: 0 }}>
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
                        <div className={styles.groupCreatorContainer} style={{ position: 'relative', marginTop: '-12px', background: 'var(--color-bg-primary)', zIndex: 10 }}>
                            <h5 className={styles.groupCreatorTitle}>New Activity Group</h5>
                            <div className={styles.groupCreatorFields}>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="Group name..."
                                    className={styles.groupCreatorInput}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateGroup();
                                        if (e.key === 'Escape') setShowGroupCreator(false);
                                    }}
                                />
                                <select
                                    value={newGroupParentId}
                                    onChange={(e) => setNewGroupParentId(e.target.value)}
                                    className={styles.groupCreatorSelect}
                                >
                                    <option value="">(Root level)</option>
                                    {eligibleParentGroups.map(g => (
                                        <option key={g.id} value={g.id}>
                                            {groupBreadcrumb(g.id)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.groupCreatorActions}>
                                <button
                                    onClick={handleCreateGroup}
                                    disabled={isCreatingGroup || !newGroupName.trim()}
                                    className={styles.groupCreatorSaveBtn}
                                >
                                    {isCreatingGroup ? 'Creating...' : 'Create Group'}
                                </button>
                                <button
                                    onClick={() => setShowGroupCreator(false)}
                                    className={styles.groupCreatorCancelBtn}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ActivityAssociator;
