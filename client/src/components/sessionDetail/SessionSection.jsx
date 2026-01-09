import React from 'react';
import SessionActivityItem from './SessionActivityItem';

/**
 * Calculate total duration in seconds for a section based on activity instances
 */
function calculateSectionDuration(section, activityInstances) {
    if (!section || !section.activity_ids || !activityInstances) return 0;

    let totalSeconds = 0;
    for (const instanceId of section.activity_ids) {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (instance && instance.duration_seconds != null) {
            totalSeconds += instance.duration_seconds;
        }
    }
    return totalSeconds;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null || seconds === 0) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SessionSection = ({
    section,
    sectionIndex,
    activityInstances,
    onDeleteActivity,
    onUpdateActivity,
    onFocusActivity,
    selectedActivityId,
    rootId,
    showActivitySelector,
    onToggleActivitySelector,
    onAddActivity,
    onOpenActivityBuilder,
    groupedActivities,
    groupMap,
    activities
}) => {
    return (
        <div
            style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderLeft: '4px solid #2196f3',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '0' /* handled by wrapper gap */
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                    {section.name || `Section ${sectionIndex + 1}`}
                </h3>
                <div style={{ fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>
                    Duration: <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                        {formatDuration(calculateSectionDuration(section, activityInstances))}
                    </span>
                    <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                        (planned: {section.estimated_duration_minutes || '—'} min)
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {section.activity_ids?.map((instanceId) => {
                    const instance = activityInstances.find(i => i.id === instanceId);
                    if (!instance) return null;
                    const definition = activities.find(a => a.id === instance.activity_definition_id);

                    return (
                        <SessionActivityItem
                            key={instanceId}
                            exercise={instance}
                            activityDefinition={definition}
                            onDelete={() => onDeleteActivity(sectionIndex, instanceId)}
                            onUpdate={(updatedData) => onUpdateActivity(instanceId, updatedData)}
                            onFocus={() => onFocusActivity(instance)}
                            isSelected={selectedActivityId === instanceId}
                            rootId={rootId}
                            /* Add required props for reordering if needed, or default them */
                            canMoveUp={false}
                            canMoveDown={false}
                            showReorderButtons={false}
                        />
                    );
                })}

                {/* Add Activity Button / Selector */}
                {showActivitySelector ? (
                    <div style={{
                        background: '#252525',
                        padding: '16px',
                        borderRadius: '6px',
                        border: '1px solid #444'
                    }}>
                        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#ddd' }}>Add Activity</span>
                            <button
                                onClick={() => onToggleActivitySelector(false)}
                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Grouped Activities */}
                            {Object.entries(groupedActivities).map(([groupId, groupActivities]) => {
                                const group = groupMap[groupId];
                                return (
                                    <div key={groupId} style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            {group?.name || 'Group'}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {groupActivities.map(act => (
                                                <button
                                                    key={act.id}
                                                    onClick={() => onAddActivity(sectionIndex, act.id)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#333',
                                                        border: '1px solid #555',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '13px'
                                                    }}
                                                >
                                                    {act.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Ungrouped */}
                            {activities.filter(a => !a.group_id).map(act => (
                                <button
                                    key={act.id}
                                    onClick={() => onAddActivity(sectionIndex, act.id)}
                                    style={{
                                        padding: '6px 12px',
                                        background: '#333',
                                        border: '1px solid #555',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    {act.name}
                                </button>
                            ))}

                            <div style={{ width: '100%', height: '1px', background: '#333', margin: '4px 0' }}></div>

                            <button
                                onClick={() => onOpenActivityBuilder(sectionIndex)}
                                style={{
                                    padding: '6px 12px',
                                    background: '#1a1a1a',
                                    border: '1px dashed #666',
                                    borderRadius: '4px',
                                    color: '#aaa',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 500
                                }}
                            >
                                + Create New Activity
                            </button>
                            <button
                                onClick={() => onToggleActivitySelector(false)}
                                style={{
                                    padding: '6px 12px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#888',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => onToggleActivitySelector(true)}
                        style={{
                            background: 'transparent',
                            border: '1px dashed #444',
                            color: '#888',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            width: '100%',
                            textAlign: 'center'
                        }}
                    >
                        + Add Activity
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionSection;
