import React, { useState, useEffect } from 'react';

/**
 * Modal for selecting activities to associate with a goal.
 * Similar interface to SelectExistingGoalModal but for activity definitions.
 */
function SelectActivitiesModal({
    isOpen,
    activityDefinitions = [],
    activityGroups = [],
    alreadyAssociatedActivityIds = [],
    onClose,
    onConfirm
}) {
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);

    // Reset selection when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setTempSelectedActivities([]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(tempSelectedActivities);
        setTempSelectedActivities([]);
    };

    const handleClose = () => {
        setTempSelectedActivities([]);
        onClose();
    };

    // Group activities by their group
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

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
                <h2 style={{ borderBottom: '1px solid #444', paddingBottom: '16px', marginBottom: '16px' }}>
                    Associate Activities with Goal
                </h2>

                <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                    Select activities that this goal requires. Associated activities help track the "Achievable" criterion in SMART goals.
                </p>

                {activityDefinitions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        <p>No activities found. Create activities in the Manage Activities page.</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        marginBottom: '20px',
                        paddingRight: '8px'
                    }}>
                        {/* Grouped activities */}
                        {activityGroups.map(group => {
                            const groupActivities = groupedActivities[group.id] || [];
                            if (groupActivities.length === 0) return null;

                            return (
                                <div key={group.id}>
                                    <div style={{
                                        fontSize: '12px',
                                        color: '#888',
                                        marginBottom: '8px',
                                        paddingBottom: '4px',
                                        borderBottom: '1px solid #333'
                                    }}>
                                        {group.name}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {groupActivities.map(activity => (
                                            <ActivitySelectionCard
                                                key={activity.id}
                                                activity={activity}
                                                isSelected={tempSelectedActivities.includes(activity.id)}
                                                isAlreadyAssociated={alreadyAssociatedActivityIds.includes(activity.id)}
                                                onToggle={() => {
                                                    if (!alreadyAssociatedActivityIds.includes(activity.id)) {
                                                        setTempSelectedActivities(prev =>
                                                            prev.includes(activity.id)
                                                                ? prev.filter(id => id !== activity.id)
                                                                : [...prev, activity.id]
                                                        );
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Ungrouped activities */}
                        {ungroupedActivities.length > 0 && (
                            <div>
                                <div style={{
                                    fontSize: '12px',
                                    color: '#888',
                                    marginBottom: '8px',
                                    paddingBottom: '4px',
                                    borderBottom: '1px solid #333'
                                }}>
                                    Ungrouped
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {ungroupedActivities.map(activity => (
                                        <ActivitySelectionCard
                                            key={activity.id}
                                            activity={activity}
                                            isSelected={tempSelectedActivities.includes(activity.id)}
                                            isAlreadyAssociated={alreadyAssociatedActivityIds.includes(activity.id)}
                                            onToggle={() => {
                                                if (!alreadyAssociatedActivityIds.includes(activity.id)) {
                                                    setTempSelectedActivities(prev =>
                                                        prev.includes(activity.id)
                                                            ? prev.filter(id => id !== activity.id)
                                                            : [...prev, activity.id]
                                                    );
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={handleClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #666',
                            color: '#ccc',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={tempSelectedActivities.length === 0}
                        style={{
                            padding: '10px 20px',
                            background: tempSelectedActivities.length === 0 ? '#444' : '#4caf50',
                            border: 'none',
                            borderRadius: '6px',
                            color: tempSelectedActivities.length === 0 ? '#888' : 'white',
                            fontWeight: 'bold',
                            cursor: tempSelectedActivities.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Add Selected ({tempSelectedActivities.length})
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActivitySelectionCard({ activity, isSelected, isAlreadyAssociated, onToggle }) {
    const hasMetrics = activity.metrics && activity.metrics.length > 0;

    return (
        <div
            onClick={onToggle}
            style={{
                background: isSelected ? '#2a4a2a' : '#1e1e1e',
                border: `2px solid ${isSelected ? '#4caf50' : (isAlreadyAssociated ? '#333' : '#444')}`,
                borderRadius: '6px',
                padding: '10px 14px',
                cursor: isAlreadyAssociated ? 'not-allowed' : 'pointer',
                opacity: isAlreadyAssociated ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
                if (!isAlreadyAssociated && !isSelected) {
                    e.currentTarget.style.borderColor = '#4caf50';
                }
            }}
            onMouseLeave={(e) => {
                if (!isAlreadyAssociated && !isSelected) {
                    e.currentTarget.style.borderColor = '#444';
                }
            }}
        >
            <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${isSelected ? '#4caf50' : '#666'}`,
                background: isSelected ? '#4caf50' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {(isSelected || isAlreadyAssociated) && '✓'}
            </div>

            <div style={{ flex: 1 }}>
                <div style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: isSelected || isAlreadyAssociated ? '#4caf50' : '#ccc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {activity.name}
                    {isAlreadyAssociated && (
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                            (Already associated)
                        </span>
                    )}
                </div>
                {activity.description && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        {activity.description}
                    </div>
                )}
                {hasMetrics && (
                    <div style={{
                        fontSize: '11px',
                        color: '#555',
                        marginTop: '4px',
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap'
                    }}>
                        {activity.metrics.map((m, idx) => (
                            <span key={idx} style={{
                                background: '#2a2a2a',
                                padding: '2px 6px',
                                borderRadius: '3px'
                            }}>
                                {m.name} ({m.unit})
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SelectActivitiesModal;
