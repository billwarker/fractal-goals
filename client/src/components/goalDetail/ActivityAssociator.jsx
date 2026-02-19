import React, { useState, useEffect, useMemo } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
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
    goalName,
    isEditing,
    onOpenSelector,
    onCloseSelector,
    onCreateActivity,
    completedViaChildren = false,
    isAboveShortTermGoal = false,
    headerColor,
    onClose,
    onSave
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
    const linkedGroupIds = useMemo(
        () => new Set((associatedActivityGroups || []).map(g => g.id)),
        [associatedActivityGroups]
    );

    // Reset selection when closing discovery; collapse all groups by default
    useEffect(() => {
        if (!isDiscoveryActive) {
            setTempSelectedActivities([]);
            setTempSelectedGroups([]);
            setShowGroupCreator(false);
            setNewGroupName('');
            setNewGroupParentId('');
        } else {
            // Start with all groups collapsed in discovery mode
            const allGroupIds = new Set(activityGroups.map(g => g.id));
            setCollapsedDiscoveryGroups(allGroupIds);
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

    const handleConfirmActivitySelection = async () => {
        const newActivities = tempSelectedActivities.map(id =>
            activityDefinitions.find(d => d.id === id)
        ).filter(Boolean);

        const updated = [...associatedActivities, ...newActivities];
        const unique = Array.from(new Map(updated.map(item => [item.id, item])).values());

        // Also associate selected groups
        let finalGroups = associatedActivityGroups;
        if (tempSelectedGroups.length > 0 && setAssociatedActivityGroups) {
            const newGroups = tempSelectedGroups
                .map(id => activityGroups.find(g => g.id === id))
                .filter(Boolean);
            const updatedGroups = [...associatedActivityGroups, ...newGroups];
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
        if (tempSelectedGroups.length > 0) parts.push(`${tempSelectedGroups.length} group${tempSelectedGroups.length === 1 ? '' : 's'}`);
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

            // If we have the goalId, auto-associate this group with the current goal
            if (result && result.id && goalId) {
                await setActivityGroupGoals(rootId, result.id, [goalId]);
                if (setAssociatedActivityGroups) {
                    setAssociatedActivityGroups(prev => {
                        if (!Array.isArray(prev)) return [result];
                        if (prev.some(g => g.id === result.id)) return prev;
                        return [...prev, result];
                    });
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

        notify.success(`Unlinked activity group "${group.name}"`);
    };

    // Build the tree of associated activities organized by group
    const buildRelevantTree = () => {
        const relevantGroupIds = new Set();
        associatedActivityGroups.forEach(g => relevantGroupIds.add(g.id));
        associatedActivities.forEach(a => {
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

        associatedActivities.forEach(a => {
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

    // Build hierarchical discovery tree
    const discoveryTree = useMemo(() => {
        const { roots: allRoots, map } = buildGroupTree(activityGroups);

        // Attach activities to groups, filtering out already associated ones
        const attachActivities = (node) => {
            node.activities = activityDefinitions.filter(a =>
                a.group_id === node.id &&
                !associatedActivities.some(aa => aa.id === a.id)
            );
            node.children.forEach(child => attachActivities(child));
            // Count total available (activities + children's activities)
            node.totalCount = node.activities.length +
                node.children.reduce((sum, c) => sum + (c.totalCount || 0), 0);
        };

        allRoots.forEach(root => attachActivities(root));

        // Filter out groups with nothing available
        const filterEmpty = (nodes) => {
            return nodes.filter(n => {
                n.children = filterEmpty(n.children);
                return n.totalCount > 0;
            });
        };

        return filterEmpty(allRoots);
    }, [activityGroups, activityDefinitions, associatedActivities]);

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

    const renderMiniCard = (activity, { isDiscovery = false } = {}) => {
        const isSelected = isDiscovery && tempSelectedActivities.includes(activity.id);
        const isInherited = activity.is_inherited;
        const isProtectedByGroup = !isDiscovery && !isInherited && isActivityProtectedByLinkedGroup(activity);

        const cardClasses = [
            styles.miniCard,
            isDiscovery && styles.miniCardSelectable,
            isSelected && styles.miniCardSelected,
            isInherited && styles.miniCardInherited,
        ].filter(Boolean).join(' ');

        return (
            <div
                key={activity.id}
                className={cardClasses}
                onClick={isDiscovery ? () => toggleActivitySelection(activity.id) : undefined}
                title={isInherited ? `Inherited from ${activity.source_goal_name}` : activity.name}
            >
                <div className={styles.miniCardHeader}>
                    {isDiscovery && (
                        <div className={styles.selectIndicator}>
                            {isSelected && '✓'}
                        </div>
                    )}
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
                    {!isDiscovery && !isInherited && !isProtectedByGroup && (
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

    const renderGroupContainer = (group, { isDiscovery = false, isNested = false } = {}) => {
        const children = group.children || [];
        const groupActivities = group.activities || [];
        const isCollapsed = isDiscovery
            ? collapsedDiscoveryGroups.has(group.id)
            : collapsedGroups.has(group.id);
        const toggleFn = isDiscovery ? toggleDiscoveryGroupCollapse : toggleGroupCollapse;
        const isLinked = associatedActivityGroups.some(g => g.id === group.id);
        const isGroupSelected = isDiscovery && tempSelectedGroups.includes(group.id);
        const activityCount = group.totalCount !== undefined ? group.totalCount : groupActivities.length;

        return (
            <div
                key={group.id}
                className={`${styles.groupContainer} ${isNested ? styles.groupContainerNested : ''} ${isGroupSelected ? styles.groupContainerSelected : ''}`}
            >
                <div className={styles.groupHeader} onClick={() => toggleFn(group.id)}>
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
                        {isDiscovery && (
                            <button
                                className={`${styles.groupSelectBtn} ${isGroupSelected ? styles.groupSelectBtnActive : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupSelection(group.id);
                                }}
                                title={isGroupSelected ? 'Unlink Activity Group' : 'Link Activity Group'}
                            >
                                {isGroupSelected ? '✓ Linked' : 'Link Activity Group'}
                            </button>
                        )}
                        {isLinked && !isDiscovery && (
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
                                {children.map(child => renderGroupContainer(child, { isDiscovery, isNested: true }))}
                            </div>
                        )}
                        {groupActivities.length > 0 && (
                            <div className={styles.activityGrid}>
                                {groupActivities.map(a => renderMiniCard(a, { isDiscovery }))}
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
                <div className={styles.discoveryContainer}>
                    <h4 className={styles.discoverySectionTitle}>
                        Available Activities & Groups
                    </h4>

                    {/* Hierarchical groups in discovery mode */}
                    {discoveryTree.map(group => renderGroupContainer(group, { isDiscovery: true }))}

                    {/* Ungrouped activities in discovery mode */}
                    {(() => {
                        const ungroupedDiscovery = activityDefinitions.filter(a =>
                            !a.group_id &&
                            !associatedActivities.some(aa => aa.id === a.id)
                        );

                        if (ungroupedDiscovery.length === 0) return null;

                        return (
                            <div className={styles.ungroupedContainer}>
                                <h4 className={styles.ungroupedTitle}>Ungrouped</h4>
                                <div className={styles.activityGrid}>
                                    {ungroupedDiscovery.map(a => renderMiniCard(a, { isDiscovery: true }))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* No available activities message */}
                    {discoveryTree.length === 0 && activityDefinitions.filter(a => !a.group_id && !associatedActivities.some(aa => aa.id === a.id)).length === 0 && (
                        <div className={styles.emptyState}>
                            All activities are already associated with this goal.
                        </div>
                    )}

                    {/* Action Bar */}
                    <div className={styles.actionBar}>
                        <button
                            onClick={handleConfirmActivitySelection}
                            disabled={tempSelectedActivities.length === 0 && tempSelectedGroups.length === 0}
                            className={styles.addSelectedBtn}
                        >
                            Add Selected ({tempSelectedActivities.length})
                        </button>
                        <button
                            onClick={() => setIsDiscoveryActive(false)}
                            className={styles.cancelBtn}
                        >
                            Cancel
                        </button>
                    </div>

                    {/* Create links */}
                    <div className={styles.createLinkRow}>
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
                    </div>

                    {/* Inline Group Creator */}
                    {showGroupCreator && (
                        <div className={styles.groupCreatorContainer}>
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
                                    {activityGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
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
