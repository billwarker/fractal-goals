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
    activityDefinitions,
    activityGroups,
    targets,
    rootId,
    goalId,
    isEditing,
    // New props for full view mode
    viewMode = 'list', // 'list' | 'selector'
    onOpenSelector,
    onCloseSelector
}) => {
    // Internal view state prioritized by props if available
    const [viewState, setViewState] = useState('list');
    const [activitySelectorGroupId, setActivitySelectorGroupId] = useState(null); // null = group view, string = specific group
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);

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
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#252525', padding: '16px', borderRadius: '8px', border: '1px solid #4caf50' }}>
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
                            color: '#888',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '0 4px'
                        }}
                    >
                        ←
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'white', flex: 1 }}>
                        {activitySelectorGroupId === null
                            ? 'Select Activity Group'
                            : activityGroups.find(g => g.id === activitySelectorGroupId)?.name || 'Activities'}
                    </h3>
                    <button onClick={handleCancelSelector} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}>×</button>
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
                                        background: '#333',
                                        border: selectedCount > 0 ? '1px solid #4caf50' : '1px solid #444',
                                        borderRadius: '8px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{group.name}</div>
                                    <div style={{ fontSize: '11px', color: '#888' }}>{groupActs.length} activities</div>
                                    {selectedCount > 0 && <div style={{ fontSize: '10px', color: '#4caf50', marginTop: '4px' }}>{selectedCount} selected</div>}
                                </button>
                            );
                        })}
                        {ungroupedActivities.length > 0 && (
                            <button
                                onClick={() => setActivitySelectorGroupId('ungrouped')}
                                style={{
                                    padding: '12px', background: '#333', border: '1px dashed #666', borderRadius: '8px', color: '#ccc', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                                }}
                            >
                                <div style={{ fontSize: '13px', fontStyle: 'italic' }}>Ungrouped</div>
                                <div style={{ fontSize: '11px', color: '#888' }}>{ungroupedActivities.length} activities</div>
                            </button>
                        )}
                    </div>
                ) : (
                    /* Activities */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                        {(activitySelectorGroupId === 'ungrouped' ? ungroupedActivities : groupedActivities[activitySelectorGroupId] || []).map(activity => {
                            const isAssoc = alreadyAssociatedIds.includes(activity.id);
                            const isSel = tempSelectedActivities.includes(activity.id);
                            return (
                                <div
                                    key={activity.id}
                                    onClick={() => handleToggleActivitySelection(activity.id)}
                                    style={{
                                        background: isSel ? '#2a4a2a' : '#1e1e1e',
                                        border: `1px solid ${isSel || isAssoc ? '#4caf50' : '#444'}`,
                                        borderRadius: '6px',
                                        padding: '10px',
                                        cursor: isAssoc ? 'not-allowed' : 'pointer',
                                        opacity: isAssoc ? 0.6 : 1,
                                        display: 'flex', alignItems: 'center', gap: '10px'
                                    }}
                                >
                                    <div style={{
                                        width: '18px', height: '18px', borderRadius: '4px',
                                        border: `1px solid ${isSel || isAssoc ? '#4caf50' : '#666'}`,
                                        background: isSel || isAssoc ? '#4caf50' : 'transparent',
                                        color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
                                    }}>
                                        {(isSel || isAssoc) && '✓'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '13px', color: isSel || isAssoc ? '#4caf50' : '#ccc', fontWeight: 'bold' }}>{activity.name}</div>
                                        {activity.description && <div style={{ fontSize: '11px', color: '#666' }}>{activity.description}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
                    <button onClick={handleCancelSelector} style={{ background: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                    <button
                        onClick={handleConfirmActivitySelection}
                        disabled={tempSelectedActivities.length === 0}
                        style={{
                            background: tempSelectedActivities.length > 0 ? '#4caf50' : '#444',
                            border: 'none', color: tempSelectedActivities.length > 0 ? 'white' : '#888',
                            borderRadius: '4px', padding: '6px 12px', cursor: tempSelectedActivities.length > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold'
                        }}
                    >
                        Add Selected ({tempSelectedActivities.length})
                    </button>
                </div>
            </div>
        );
    }

    // Default View
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ display: 'block', margin: 0, fontSize: '12px', color: '#aaa' }}>
                    Achievable (Activities)
                </label>
                {isEditing && (
                    <button
                        onClick={() => {
                            setViewState('selector');
                            if (onOpenSelector) onOpenSelector();
                        }}
                        style={{
                            background: '#2a2a2a',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
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
                <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
                    No activities associated.
                </div>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {associatedActivities.map(activity => (
                        <div
                            key={activity.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                background: '#2a3a2a',
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
                                        color: '#888',
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
                    {/* Show expander if needed - simplified for this refactor to always show all or wrap */}
                </div>
            )}
        </div>
    );
};

export default ActivityAssociator;
