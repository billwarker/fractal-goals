import React, { useState, useEffect } from 'react';
import { fractalApi } from '../../utils/api';
import notify from '../../utils/notify';

/**
 * ActivityAssociator Component
 * 
 * Manages associated activities for a goal ("SMART Achievable").
 * New Layout: "Manage Activities" style (Cards for Groups, Pills for Activities).
 * Features:
 * - Display inherited activities (read-only)
 * - Display associated groups (as cards)
 * - Discovery mode for adding new activities/groups
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
    isEditing, // Passed from parent (usually true if in GoalDetailModal)
    // Props for callbacks
    onOpenSelector, // Legacy?
    onCloseSelector, // Legacy?
    onCreateActivity,
    completedViaChildren = false,
    isAboveShortTermGoal = false,
    headerColor
}) => {
    // STATE
    // "Discovery Mode" determines if we show the "Add/Edit" detailed view
    // The previous implementation used `isEditing` prop, but we might want a local toggle for the "Associate" section
    const [isDiscoveryActive, setIsDiscoveryActive] = useState(false);

    // Selection state for Discovery Mode
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);
    const [expandedDiscoveryGroups, setExpandedDiscoveryGroups] = useState([]);

    // Reset selection when closing discovery
    useEffect(() => {
        if (!isDiscoveryActive) {
            setTempSelectedActivities([]);
            setExpandedDiscoveryGroups([]);
        }
    }, [isDiscoveryActive]);

    // HANDLERS

    const toggleDiscoveryGroup = (groupId) => {
        setExpandedDiscoveryGroups(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const toggleActivitySelection = (activityId) => {
        setTempSelectedActivities(prev =>
            prev.includes(activityId) ? prev.filter(id => id !== activityId) : [...prev, activityId]
        );
    };

    const handleConfirmActivitySelection = async () => {
        // Collect selected activities
        const newActivities = tempSelectedActivities.map(id =>
            activityDefinitions.find(d => d.id === id)
        ).filter(Boolean);

        // Update local state (Parent will save on "Save" usually, or we assume immediate update?)
        // In this app, `associatedActivities` seems to be state in `GoalDetailModal`.
        // We just update it.
        const updated = [...associatedActivities, ...newActivities];
        // Unique by ID
        const unique = Array.from(new Map(updated.map(item => [item.id, item])).values());

        setAssociatedActivities(unique);
        setTempSelectedActivities([]);
        setIsDiscoveryActive(false);
        notify.success(`Added ${newActivities.length} activities`);
    };

    const handleRemoveActivity = (activityId) => {
        setAssociatedActivities(prev => prev.filter(a => a.id !== activityId));
    };

    // View Helpers
    // 1. Organize "Associated" items into a tree (Groups -> Activities)
    // We want to show:
    // - Groups that are explicitly associated
    // - Groups that contain associated activities (even if group itself isn't explicitly associated)
    // - Inherited activities in their respective groups

    const buildRelevantTree = () => {
        const relevantGroupIds = new Set();

        // Add explicitly associated groups
        associatedActivityGroups.forEach(g => relevantGroupIds.add(g.id));

        // Add groups containing associated activities
        associatedActivities.forEach(a => {
            if (a.group_id) relevantGroupIds.add(a.group_id);
        });

        // Fetch group objects
        const relevantGroups = activityGroups.filter(g => relevantGroupIds.has(g.id));

        // Build map
        const map = {};
        relevantGroups.forEach(g => {
            map[g.id] = { ...g, children: [], activities: [] };
        });

        // Add "Ungrouped" virtual group
        const ungrouped = { id: 'ungrouped', name: 'Ungrouped Activities', children: [], activities: [] };

        // Distribute activities
        associatedActivities.forEach(a => {
            if (a.group_id && map[a.group_id]) {
                map[a.group_id].activities.push(a);
            } else {
                ungrouped.activities.push(a);
            }
        });

        // Build Hierarchy
        const roots = [];
        relevantGroups.forEach(g => {
            if (g.parent_id && map[g.parent_id]) {
                map[g.parent_id].children.push(map[g.id]);
            } else {
                // If parent isn't relevant, treat as root?
                // Or check if parent exists in `activityGroups` but wasn't marked relevant?
                // For simplified display, if parent isn't relevant, show as root.
                roots.push(map[g.id]);
            }
        });

        // Sort
        roots.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        return { roots, ungrouped };
    };

    const { roots, ungrouped } = buildRelevantTree();

    // RENDERERS

    const renderActivityPill = (activity, isDiscovery = false) => {
        const isSelected = isDiscovery && tempSelectedActivities.includes(activity.id);
        const isInherited = activity.is_inherited;
        // Check if explicitly associated (for discovery view styling)
        const isAlreadyAssociated = !isDiscovery && false; // In discovery, we filter out associated ones usually

        return (
            <div
                key={activity.id}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isDiscovery) toggleActivitySelection(activity.id);
                }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: isSelected
                        ? '#4caf50'
                        : 'var(--color-bg-input)',
                    border: isSelected
                        ? '1px solid #4caf50'
                        : isInherited
                            ? '1px dashed var(--color-border)'
                            : '1px solid var(--color-border)',
                    color: isSelected ? 'white' : 'var(--color-text-primary)',
                    cursor: isDiscovery ? 'pointer' : 'default',
                    fontSize: '13px',
                    opacity: isInherited ? 0.7 : 1,
                    transition: 'all 0.2s ease'
                }}
                title={isInherited ? `Inherited from ${activity.source_goal_name}` : ''}
            >
                {/* Inherited Icon/Text */}
                {isInherited && <span style={{ fontSize: '10px', opacity: 0.7 }}>↳</span>}

                {activity.name}

                {/* Remove Button (Only for direct, non-discovery items) */}
                {!isDiscovery && !isInherited && (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveActivity(activity.id);
                        }}
                        style={{
                            cursor: 'pointer',
                            marginLeft: '6px',
                            opacity: 0.6,
                            fontWeight: 'bold'
                        }}
                    >
                        ×
                    </span>
                )}
            </div>
        );
    };

    const renderGroupCard = (group) => {
        // Recursive render
        const children = group.children?.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) || [];
        const activities = group.activities || [];

        // Determine border style
        // If it's a root group (no parent in this context), give it primary accent
        // If it's nested, give it neutral border
        // We can't easily iterate depth here without passing it, assuming simple styling for now.

        return (
            <div key={group.id} style={{
                background: 'var(--color-bg-card-alt)',
                border: '1px solid var(--color-border)',
                borderLeft: group.parent_id ? '3px solid var(--color-border)' : '3px solid var(--color-brand-primary)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '8px',
                display: 'flex', flexDirection: 'column', gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {group.name}
                    </h4>
                    {/* Optional: Show "Linked Group" badge if group itself is in associatedActivityGroups */}
                    {associatedActivityGroups.some(g => g.id === group.id) && (
                        <span style={{ fontSize: '10px', background: 'var(--color-brand-primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                            Linked
                        </span>
                    )}
                </div>

                {/* Recursively Render Children */}
                {children.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
                        {children.map(child => renderGroupCard(child))}
                    </div>
                )}

                {/* Render Activities */}
                {activities.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {activities.map(a => renderActivityPill(a, false))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: '600',
                    color: headerColor || 'var(--color-text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    Associated Activities
                </h3>
                {associatedActivities.length > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {associatedActivities.length} total
                    </span>
                )}
            </div>

            {/* ASSOCIATED CONTENT AREA */}
            {(roots.length > 0 || ungrouped.activities.length > 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {/* Render Groups */}
                    {roots.map(group => renderGroupCard(group))}

                    {/* Render Ungrouped */}
                    {ungrouped.activities.length > 0 && (
                        <div style={{
                            background: 'var(--color-bg-card-alt)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '8px'
                        }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                                Ungrouped
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {ungrouped.activities.map(a => renderActivityPill(a, false))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-text-muted)',
                    fontSize: '13px'
                }}>
                    No activities associated.
                </div>
            )}

            {/* ACTION AREA - Non-Discovery */}
            {!isDiscoveryActive && (
                <button
                    onClick={() => setIsDiscoveryActive(true)}
                    style={{
                        background: 'transparent',
                        border: '1.5px solid #4caf50',
                        color: '#4caf50',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        alignSelf: 'flex-start'
                    }}
                >
                    Associate New Activities
                </button>
            )}

            {/* COMPLETION VIA CHILDREN NOTE */}
            {associatedActivities.length === 0 && isAboveShortTermGoal && !completedViaChildren && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: '-8px' }}>
                    (Goal implies completion via children unless activities are added)
                </div>
            )}

            {/* DISCOVERY AREA */}
            {isDiscoveryActive && (
                <div style={{
                    marginTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '20px',
                    background: 'var(--color-bg-card-alt)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)'
                }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                        Available Activities & Groups
                    </h4>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {/* GROUPS for Discovery */}
                        {activityGroups.map(group => {
                            // Filter logic: Show group if it has ANY unassociated activities?
                            // Or just show all groups and let user dive in.
                            // To keep it clean, show all groups.

                            const isExpanded = expandedDiscoveryGroups.includes(group.id);

                            // Find activities in this group that are NOT already associated (direct or inherited)
                            // Note: We might want to allow re-associating an inherited one as direct? 
                            // For now, filter out ONLY direct associations (so you can't double-add).
                            // Inherited ones should maybe be explicitly filtered too?
                            // Yes, if it's inherited, it's "associated".
                            const groupActivities = activityDefinitions.filter(a =>
                                a.group_id === group.id &&
                                !associatedActivities.some(aa => aa.id === a.id)
                            );

                            if (groupActivities.length === 0) return null;

                            return (
                                <div key={`disc-grp-${group.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: isExpanded ? '100%' : 'auto' }}>
                                    <div
                                        onClick={() => toggleDiscoveryGroup(group.id)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '16px',
                                            background: 'var(--color-bg-card)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-primary)',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            alignSelf: 'flex-start'
                                        }}
                                    >
                                        <span style={{ fontWeight: '600' }}>{group.name}</span>
                                        <span style={{ fontSize: '11px', opacity: 0.7 }}>({groupActivities.length})</span>
                                        <span style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '8px',
                                            padding: '8px',
                                            borderLeft: '2px solid var(--color-border)',
                                            marginLeft: '10px'
                                        }}>
                                            {groupActivities.map(activity => renderActivityPill(activity, true))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* UNGROUPED for Discovery */}
                        {activityDefinitions.filter(a =>
                            !a.group_id &&
                            !associatedActivities.some(aa => aa.id === a.id)
                        ).map(activity => renderActivityPill(activity, true))}
                    </div>

                    {/* ACTIONS */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                        <button
                            onClick={handleConfirmActivitySelection}
                            disabled={tempSelectedActivities.length === 0}
                            style={{
                                flex: 1,
                                background: tempSelectedActivities.length > 0 ? '#4caf50' : 'var(--color-bg-card-alt)',
                                border: `1px solid ${tempSelectedActivities.length > 0 ? '#4caf50' : 'var(--color-border)'}`,
                                color: tempSelectedActivities.length > 0 ? 'white' : 'var(--color-text-muted)',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                cursor: tempSelectedActivities.length > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold',
                                fontSize: '13px'
                            }}
                        >
                            Add Selected ({tempSelectedActivities.length})
                        </button>

                        <button
                            onClick={() => setIsDiscoveryActive(false)}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-muted)',
                                borderRadius: '8px',
                                padding: '10px 16px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                    </div>

                    {/* QUICK CREATE LINKS */}
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '4px' }}>
                        <span
                            onClick={() => notify.info("Use main navigation to create groups (Simplicity)")}
                            style={{ fontSize: '12px', color: 'var(--color-brand-primary)', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            + Create New Group
                        </span>
                        <span
                            onClick={() => onCreateActivity && onCreateActivity()}
                            style={{ fontSize: '12px', color: 'var(--color-brand-primary)', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            + Create New Activity
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityAssociator;
