import React, { useState, useEffect, useMemo } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
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
    onClose
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
        if (tempSelectedGroups.length > 0 && setAssociatedActivityGroups) {
            const newGroups = tempSelectedGroups
                .map(id => activityGroups.find(g => g.id === id))
                .filter(Boolean);
            const updatedGroups = [...associatedActivityGroups, ...newGroups];
            const uniqueGroups = Array.from(new Map(updatedGroups.map(g => [g.id, g])).values());
            setAssociatedActivityGroups(uniqueGroups);
        }

        setAssociatedActivities(unique);
        setTempSelectedActivities([]);
        setTempSelectedGroups([]);
        setIsDiscoveryActive(false);

        const parts = [];
        if (newActivities.length > 0) parts.push(`${newActivities.length} activit${newActivities.length === 1 ? 'y' : 'ies'}`);
        if (tempSelectedGroups.length > 0) parts.push(`${tempSelectedGroups.length} group${tempSelectedGroups.length === 1 ? '' : 's'}`);
        if (parts.length > 0) notify.success(`Added ${parts.join(' and ')}`);
    };

    const handleRemoveActivity = (activityId) => {
        setAssociatedActivities(prev => prev.filter(a => a.id !== activityId));
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            notify.error('Please enter a group name');
            return;
        }
        setIsCreatingGroup(true);
        try {
            const data = {
                name: newGroupName.trim(),
                parent_id: newGroupParentId || null
            };
            const result = await createActivityGroup(rootId, data);

            // If we have the goalId, auto-associate this group with the current goal
            if (result && result.id && goalId) {
                await setActivityGroupGoals(rootId, result.id, [goalId]);
            }

            // Refresh groups in parent
            if (fetchActivityGroups) {
                await fetchActivityGroups(rootId);
            }

            notify.success(`Created group "${newGroupName.trim()}"`);
            setNewGroupName('');
            setNewGroupParentId('');
            setShowGroupCreator(false);
        } catch (err) {
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

        return { roots, ungrouped };
    };

    const { roots, ungrouped } = buildRelevantTree();

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
            node.totalAvailable = node.activities.length +
                node.children.reduce((sum, c) => sum + (c.totalAvailable || 0), 0);
        };

        allRoots.forEach(root => attachActivities(root));

        // Filter out groups with nothing available
        const filterEmpty = (nodes) => {
            return nodes.filter(n => {
                n.children = filterEmpty(n.children);
                return n.totalAvailable > 0;
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
                        {isInherited && <span style={{ marginRight: '4px', opacity: 0.6 }}>↳</span>}
                        {activity.name}
                    </h4>
                    {!isDiscovery && !isInherited && (
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
        const activityCount = isDiscovery
            ? (group.totalAvailable || groupActivities.length)
            : groupActivities.length;

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
                            <span className={styles.groupBadge}>Linked</span>
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
                    <div className={styles.headerLeft}>
                        <button
                            onClick={onCloseSelector}
                            className={styles.backBtn}
                            style={{ color: headerColor || 'var(--color-text-primary)' }}
                            title="Back to Goal"
                        >
                            ←
                        </button>
                        <h3 className={styles.headerTitle} style={{ color: headerColor || 'var(--color-text-primary)' }}>
                            Associated Activities
                            {associatedActivities.length > 0 && (
                                <span className={styles.headerCount}>
                                    ({associatedActivities.length})
                                </span>
                            )}
                        </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {onClose && (
                            <button onClick={onClose} className={styles.closeBtn}>×</button>
                        )}
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
