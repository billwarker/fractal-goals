import React, { useState } from 'react';
import { fractalApi } from '../../utils/api';

/**
 * ActivityAssociator Component
 * 
 * Manages associated activities for a goal ("SMART Achievable").
 * Handles listing, adding, and removing associations.
 */
const ActivityAssociator = ({
    associatedActivities,
    setAssociatedActivities,
    associatedActivityGroups = [], // New prop for group associations
    setAssociatedActivityGroups,   // New prop for setter
    activityDefinitions,
    activityGroups,
    setActivityGroups,  // To update groups after creation
    targets,
    rootId,
    goalId,
    goalName,  // For prepopulating new group name
    isEditing,
    // New props for full view mode
    viewMode = 'list', // 'list' | 'selector'
    onOpenSelector,
    onCloseSelector,
    onCreateActivity,  // Callback to open ActivityBuilder for creating new activity
    completedViaChildren = false,
    isAboveShortTermGoal = false,
    headerColor // New prop for header color
}) => {
    // Internal view state prioritized by props if available
    const [viewState, setViewState] = useState('list');
    const [activitySelectorGroupId, setActivitySelectorGroupId] = useState(null); // null = group view, string = specific group
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);

    // Inline group creation state
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
    const [isUpdatingGroupLink, setIsUpdatingGroupLink] = useState(false);

    const handleToggleGroupAssociation = async (groupId, isLinked) => {
        if (!groupId || groupId === 'ungrouped' || isUpdatingGroupLink) return;

        setIsUpdatingGroupLink(true);
        try {
            if (isLinked) {
                // Unlink
                await fractalApi.unlinkGoalActivityGroup(rootId, goalId, groupId);
                if (setAssociatedActivityGroups) {
                    setAssociatedActivityGroups(prev => prev.filter(g => g.id !== groupId));
                }
            } else {
                // Link
                await fractalApi.linkGoalActivityGroup(rootId, goalId, groupId);
                if (setAssociatedActivityGroups) {
                    const group = activityGroups.find(g => g.id === groupId);
                    if (group) {
                        setAssociatedActivityGroups(prev => [...prev, { id: group.id, name: group.name }]);

                        // Also automatically select all activities in the group for visual consistency?
                        // Actually, if a group is linked, all its activities are implicitly associated.
                        // The backend returns them in getGoalActivities now.
                        // But we might want to refresh activity list too?
                        // For now, let's just rely on the group link indicator.

                        // Optional: Refresh activities to show them as associated immediately
                        const response = await fractalApi.getGoalActivities(rootId, goalId);
                        if (setAssociatedActivities) setAssociatedActivities(response.data || []);
                    }
                }
            }
        } catch (error) {
            console.error('Error toggling group association:', error);
            alert('Failed to update group association.');
        } finally {
            setIsUpdatingGroupLink(false);
        }
    };

    // Derived state for selector
    const alreadyAssociatedIds = associatedActivities.map(a => a.id);
    const groupedActivities = {};
    const ungroupedActivities = [];

    activityDefinitions.forEach(activity => {
        if (activity.group_id) {
            if (!groupedActivities[activity.group_id]) {
                groupedActivities[activity.group_id] = [];
            }
            groupedActivities[activity.group_id].push(activity);
        } else {
            ungroupedActivities.push(activity);
        }
    });

    // Handlers
    const handleToggleActivitySelection = (activityId) => {
        if (alreadyAssociatedIds.includes(activityId)) {
            return; // Already associated
        }
        setTempSelectedActivities(prev =>
            prev.includes(activityId)
                ? prev.filter(id => id !== activityId)
                : [...prev, activityId]
        );
    };

    const handleConfirmActivitySelection = async () => {
        if (!rootId || !goalId || tempSelectedActivities.length === 0) {
            setViewState('list');
            if (onCloseSelector) onCloseSelector();
            setTempSelectedActivities([]);
            return;
        }

        try {
            // For each new activity, add the goal to its associations
            // We do this individually as per the API pattern in the original code
            for (const activityId of tempSelectedActivities) {
                const activity = activityDefinitions.find(a => a.id === activityId);
                if (activity) {
                    const currentGoals = activity.goal_ids || [];
                    const newGoalIds = [...new Set([...currentGoals, goalId])];
                    await fractalApi.setActivityGoals(rootId, activityId, newGoalIds);
                }
            }

            // Refresh associations by re-fetching (simulated by updating local state here for now, 
            // relying on parent to refetch or we just push manually if we trust the operation).
            // The original code re-fetched. We'll try to just update local state to be faster, 
            // but fetching is safer. 
            // Let's assume the parent might verify, but for now lets just update local state.
            const newActivities = activityDefinitions.filter(a => tempSelectedActivities.includes(a.id));
            setAssociatedActivities(prev => [...prev, ...newActivities]);

        } catch (error) {
            console.error('Error adding activity associations:', error);
            alert('Failed to save associations: ' + error.message);
        }

        setViewState('list');
        setActivitySelectorGroupId(null);
        setTempSelectedActivities([]);
        if (onCloseSelector) onCloseSelector();
    };

    const handleRemoveActivity = async (activityId) => {
        // Validation: Check if used in targets
        const activityToRemove = associatedActivities.find(a => String(a.id) === String(activityId));
        const isUsedInTarget = targets.some(t => {
            if (String(t.activity_id) === String(activityId)) return true;
            if (activityToRemove) {
                const normalize = s => s ? String(s).trim().toLowerCase() : '';
                const activityName = normalize(activityToRemove.name);
                const targetActivityDef = activityDefinitions.find(ad => ad.id === t.activity_id);
                if (targetActivityDef && normalize(targetActivityDef.name) === activityName) return true;
                if (t.name && normalize(t.name) === activityName) return true;
            }
            return false;
        });

        if (isUsedInTarget) {
            alert('Cannot remove this activity because it is used in one or more targets for this goal. Please remove the targets first.');
            return;
        }

        if (!rootId || !goalId) return;

        try {
            await fractalApi.removeActivityGoal(rootId, activityId, goalId);
            setAssociatedActivities(prev => prev.filter(a => a.id !== activityId));
        } catch (error) {
            console.error('Error removing activity association:', error);
            alert('Failed to remove association');
        }
    };

    const handleCancelSelector = () => {
        setViewState('list');
        setActivitySelectorGroupId(null);
        setTempSelectedActivities([]);
        if (onCloseSelector) onCloseSelector();
    };

    // Determine current view mode
    const shouldRenderSelector = viewMode === 'selector' || viewState === 'selector';

    // Render Logic
    if (shouldRenderSelector) {
        // When embedded=false (rendered as full modal view), skip the container styling
        const containerStyle = viewMode === 'selector'
            ? { display: 'flex', flexDirection: 'column', gap: '14px' }  // Full view - no container box
            : { display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-bg-card-alt)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' };  // Embedded - has container

        return (
            <div style={containerStyle}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #4caf50'
                }}>
                    <button
                        onClick={() => {
                            if (activitySelectorGroupId !== null) {
                                setActivitySelectorGroupId(null);
                            } else {
                                handleCancelSelector();
                            }
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '0 4px'
                        }}
                    >
                        ←
                    </button>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)' }}>
                            {activitySelectorGroupId === null
                                ? 'Select Activity Group'
                                : activityGroups.find(g => g.id === activitySelectorGroupId)?.name || 'Activities'}
                        </h3>
                        {/* Include Entire Group Toggle */}
                        {activitySelectorGroupId !== null && activitySelectorGroupId !== 'ungrouped' && (() => {
                            const isGroupLinked = associatedActivityGroups.some(g => g.id === activitySelectorGroupId);
                            return (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleGroupAssociation(activitySelectorGroupId, isGroupLinked);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 8px',
                                        background: isGroupLinked ? 'var(--color-bg-input)' : 'transparent',
                                        border: `1px solid ${isGroupLinked ? '#4caf50' : 'var(--color-border)'}`,
                                        borderRadius: '4px',
                                        cursor: isUpdatingGroupLink ? 'wait' : 'pointer',
                                        marginLeft: '12px'
                                    }}
                                >
                                    <div style={{
                                        width: '14px', height: '14px', borderRadius: '3px',
                                        border: `1px solid ${isGroupLinked ? '#4caf50' : '#666'}`,
                                        background: isGroupLinked ? '#4caf50' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'black', fontSize: '10px'
                                    }}>
                                        {isGroupLinked && '✓'}
                                    </div>
                                    <span style={{ fontSize: '11px', color: isGroupLinked ? '#4caf50' : '#888' }}>
                                        Include Entire Group
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                    <button onClick={handleCancelSelector} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '18px' }}>×</button>
                </div>

                {/* Content */}
                {activitySelectorGroupId === null ? (
                    /* Groups */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                        {activityGroups.map(group => {
                            const groupActs = groupedActivities[group.id] || [];
                            if (groupActs.length === 0) return null;
                            const selectedCount = groupActs.filter(a => alreadyAssociatedIds.includes(a.id) || tempSelectedActivities.includes(a.id)).length;

                            return (
                                <button
                                    key={group.id}
                                    onClick={() => setActivitySelectorGroupId(group.id)}
                                    style={{
                                        padding: '12px',
                                        background: 'var(--color-bg-input)',
                                        border: selectedCount > 0 ? '1px solid #4caf50' : '1px solid var(--color-border)',
                                        borderRadius: '8px',
                                        color: 'var(--color-text-primary)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{group.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{groupActs.length} activities</div>
                                    {selectedCount > 0 && <div style={{ fontSize: '10px', color: '#4caf50', marginTop: '4px' }}>{selectedCount} selected</div>}
                                </button>
                            );
                        })}
                        {ungroupedActivities.length > 0 && (
                            <button
                                onClick={() => setActivitySelectorGroupId('ungrouped')}
                                style={{
                                    padding: '12px', background: 'var(--color-bg-input)', border: '1px dashed var(--color-border)', borderRadius: '8px', color: 'var(--color-text-secondary)', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                                }}
                            >
                                <div style={{ fontSize: '13px', fontStyle: 'italic' }}>Ungrouped</div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{ungroupedActivities.length} activities</div>
                            </button>
                        )}
                    </div>
                ) : (
                    /* Activities */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(activitySelectorGroupId === 'ungrouped' ? ungroupedActivities : groupedActivities[activitySelectorGroupId] || []).map(activity => {
                                const isAssoc = alreadyAssociatedIds.includes(activity.id);
                                const isSel = tempSelectedActivities.includes(activity.id);
                                return (
                                    <div
                                        key={activity.id}
                                        onClick={() => handleToggleActivitySelection(activity.id)}
                                        style={{
                                            background: isSel ? 'var(--color-bg-card-hover)' : 'var(--color-bg-input)',
                                            border: `1px solid ${isSel || isAssoc ? '#4caf50' : 'var(--color-border)'}`,
                                            borderRadius: '6px',
                                            padding: '10px',
                                            cursor: isAssoc ? 'not-allowed' : 'pointer',
                                            opacity: isAssoc ? 0.6 : 1,
                                            display: 'flex', alignItems: 'center', gap: '10px'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '4px',
                                            border: `1px solid ${isSel || isAssoc ? '#4caf50' : 'var(--color-text-muted)'}`,
                                            background: isSel || isAssoc ? '#4caf50' : 'transparent',
                                            color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
                                        }}>
                                            {(isSel || isAssoc) && '✓'}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', color: isSel || isAssoc ? '#4caf50' : 'var(--color-text-primary)', fontWeight: 'bold' }}>{activity.name}</div>
                                            {activity.description && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{activity.description}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>


                    </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
                    {/* Create New Activity Button */}
                    {onCreateActivity && (
                        <button
                            onClick={onCreateActivity}
                            style={{
                                background: 'transparent',
                                border: '1px dashed #4caf50',
                                color: '#4caf50',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            + Create New Activity
                        </button>
                    )}

                    {/* Create New Group button (only in group selection view) */}
                    {activitySelectorGroupId === null && !isCreatingGroup && (
                        <button
                            onClick={() => {
                                setNewGroupName(goalName || '');
                                setIsCreatingGroup(true);
                            }}
                            style={{
                                background: 'transparent',
                                border: '1px dashed #888',
                                color: 'var(--color-text-muted)',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            + Create New Group
                        </button>
                    )}

                    {!onCreateActivity && !isCreatingGroup && activitySelectorGroupId !== null && <div />}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleCancelSelector} style={{ background: 'transparent', border: '1px solid var(--color-text-muted)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                        <button
                            onClick={handleConfirmActivitySelection}
                            disabled={tempSelectedActivities.length === 0}
                            style={{
                                background: tempSelectedActivities.length > 0 ? '#4caf50' : 'var(--color-bg-input)',
                                border: 'none', color: tempSelectedActivities.length > 0 ? 'white' : 'var(--color-text-muted)',
                                borderRadius: '4px', padding: '6px 12px', cursor: tempSelectedActivities.length > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold'
                            }}
                        >
                            Add Selected ({tempSelectedActivities.length})
                        </button>
                    </div>
                </div>

                {/* Inline Group Creation Form */}
                {isCreatingGroup && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px',
                        background: 'var(--color-bg-card-alt)',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)'
                    }}>
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Enter group name..."
                            autoFocus
                            style={{
                                flex: 1,
                                padding: '8px 10px',
                                background: 'var(--color-bg-input)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                color: 'var(--color-text-primary)',
                                fontSize: '13px'
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newGroupName.trim()) {
                                    handleCreateGroup();
                                } else if (e.key === 'Escape') {
                                    setIsCreatingGroup(false);
                                    setNewGroupName('');
                                }
                            }}
                        />
                        <button
                            onClick={async () => {
                                if (!newGroupName.trim()) return;
                                setIsSubmittingGroup(true);
                                try {
                                    const response = await fractalApi.createActivityGroup(rootId, { name: newGroupName.trim() });
                                    const newGroup = response.data;
                                    if (setActivityGroups) {
                                        setActivityGroups(prev => [...prev, newGroup]);
                                    }
                                    setIsCreatingGroup(false);
                                    setNewGroupName('');
                                } catch (error) {
                                    console.error('Error creating activity group:', error);
                                    alert('Failed to create group: ' + error.message);
                                } finally {
                                    setIsSubmittingGroup(false);
                                }
                            }}
                            disabled={isSubmittingGroup || !newGroupName.trim()}
                            style={{
                                padding: '8px 12px',
                                background: isSubmittingGroup || !newGroupName.trim() ? 'var(--color-bg-input)' : '#4caf50',
                                border: 'none',
                                borderRadius: '4px',
                                color: isSubmittingGroup || !newGroupName.trim() ? 'var(--color-text-muted)' : 'white',
                                cursor: isSubmittingGroup || !newGroupName.trim() ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}
                        >
                            {isSubmittingGroup ? '...' : 'Save'}
                        </button>
                        <button
                            onClick={() => {
                                setIsCreatingGroup(false);
                                setNewGroupName('');
                            }}
                            style={{
                                padding: '8px 12px',
                                background: 'transparent',
                                border: '1px solid var(--color-text-muted)',
                                borderRadius: '4px',
                                color: 'var(--color-text-muted)',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Associated Activities Display */}
                {associatedActivities.length > 0 && (
                    <>
                        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '4px', paddingTop: '14px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: headerColor || 'var(--color-text-muted)', fontWeight: 'bold' }}>
                                Associated Activities ({associatedActivities.length})
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {associatedActivities.map(activity => {
                                    // Check if activity is used in a target
                                    const isUsedInTarget = targets.some(t => {
                                        if (String(t.activity_id) === String(activity.id)) return true;
                                        const normalize = s => s ? String(s).trim().toLowerCase() : '';
                                        const activityName = normalize(activity.name);
                                        const targetActivityDef = activityDefinitions.find(ad => ad.id === t.activity_id);
                                        if (targetActivityDef && normalize(targetActivityDef.name) === activityName) return true;
                                        if (t.name && normalize(t.name) === activityName) return true;
                                        return false;
                                    });

                                    return (
                                        <div
                                            key={activity.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '4px 10px',
                                                background: 'var(--color-bg-card-alt)',
                                                border: '1px solid #4caf50',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                color: '#4caf50'
                                            }}
                                        >
                                            <span>{activity.name}</span>
                                            {!isUsedInTarget && (
                                                <button
                                                    onClick={() => handleRemoveActivity(activity.id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--color-text-muted)',
                                                        fontSize: '14px',
                                                        cursor: 'pointer',
                                                        padding: '0',
                                                        display: 'flex'
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // Default View
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ display: 'block', margin: 0, fontSize: '12px', color: headerColor || 'var(--color-text-muted)', fontWeight: 'bold' }}>
                    Associated Activities
                </label>
                {isEditing && (
                    <button
                        onClick={() => {
                            // If parent controls view (onOpenSelector provided), only call parent
                            // Otherwise use internal state
                            if (onOpenSelector) {
                                onOpenSelector();
                            } else {
                                setViewState('selector');
                            }
                        }}
                        style={{
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px 6px'
                        }}
                    >
                        + Add Activity
                    </button>
                )}
            </div>


            {associatedActivities.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    {isAboveShortTermGoal && !completedViaChildren
                        ? "No activities associated. Can also be completed via children."
                        : "No activities associated."}
                </div>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {associatedActivities.slice(0, 10).map(activity => (
                        <div
                            key={activity.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                background: 'var(--color-bg-card-alt)',
                                border: '1px solid #4caf50',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: '#4caf50'
                            }}
                        >
                            <span>{activity.name}</span>
                            {isEditing && (
                                <button
                                    onClick={() => handleRemoveActivity(activity.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-text-muted)',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        padding: '0',
                                        display: 'flex'
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                    {associatedActivities.length > 10 && (
                        <span
                            onClick={() => {
                                if (onOpenSelector) {
                                    onOpenSelector();
                                } else {
                                    setViewState('selector');
                                }
                            }}
                            style={{
                                fontSize: '12px',
                                color: '#4caf50',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                padding: '4px'
                            }}
                        >
                            and {associatedActivities.length - 10} more
                        </span>
                    )}
                </div>
            )
            }
        </div >
    );
};

export default ActivityAssociator;
