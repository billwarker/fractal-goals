import React from 'react';

/**
 * TargetCard Component
 * Displays an activity target with metrics and completion status
 */
function TargetCard({ target, activityDefinitions, onEdit, onDelete, isCompleted, isEditMode = false }) {
    // Find the activity definition
    const activityDef = activityDefinitions.find(a => a.id === target.activity_id);

    if (!activityDef) {
        // In view mode, don't show targets with missing activities
        if (!isEditMode) {
            return null;
        }
        // In edit mode, show a warning so user can delete it
        return (
            <div style={{
                padding: '12px',
                background: '#2a2a2a',
                border: '1px solid #f44336',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: '#f44336', fontSize: '13px' }}>
                    Activity not found (may have been deleted)
                </span>
                <button
                    onClick={onDelete}
                    style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: '1px solid #f44336',
                        borderRadius: '3px',
                        color: '#f44336',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                >
                    Delete
                </button>
            </div>
        );
    }

    return (
        <div style={{
            padding: '12px',
            background: '#2a2a2a',
            border: `1px solid ${isCompleted ? '#4caf50' : '#666'}`,
            borderLeft: `4px solid ${isCompleted ? '#4caf50' : '#ff9800'}`,
            borderRadius: '6px',
            marginBottom: '10px'
        }}>
            {/* Header with name and completion status */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{
                        fontSize: '16px',
                        color: isCompleted ? '#4caf50' : '#666'
                    }}>
                        {isCompleted ? '✓' : '○'}
                    </span>
                    <div>
                        <div style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color: isCompleted ? '#4caf50' : 'white'
                        }}>
                            {target.name || activityDef.name}
                        </div>
                        {target.description && (
                            <div style={{
                                fontSize: '11px',
                                color: '#888',
                                marginTop: '2px'
                            }}>
                                {target.description}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action buttons - only show in edit mode */}
                {isEditMode && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            onClick={onEdit}
                            style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: '1px solid #666',
                                borderRadius: '3px',
                                color: '#ccc',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                        >
                            Edit
                        </button>
                        <button
                            onClick={onDelete}
                            style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: '1px solid #f44336',
                                borderRadius: '3px',
                                color: '#f44336',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                        >
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {/* Target metrics */}
            <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                paddingLeft: '28px'
            }}>
                {target.metrics?.map(metric => {
                    const metricDef = activityDef.metric_definitions?.find(m => m.id === metric.metric_id);
                    if (!metricDef) return null;

                    return (
                        <div
                            key={metric.metric_id}
                            style={{
                                background: '#1e1e1e',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: '1px solid #444',
                                fontSize: '12px'
                            }}
                        >
                            <span style={{ color: '#888' }}>{metricDef.name}:</span>
                            {' '}
                            <span style={{ fontWeight: 'bold', color: isCompleted ? '#4caf50' : 'white' }}>
                                {metric.value} {metricDef.unit}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default TargetCard;
