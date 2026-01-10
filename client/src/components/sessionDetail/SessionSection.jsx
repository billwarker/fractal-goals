import React, { useState } from 'react';
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
    activities,
    onNoteCreated,
    sessionId,
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote
}) => {
    const [viewGroupId, setViewGroupId] = useState(null);

    // Filter ungrouped activities
    const ungroupedActivities = activities.filter(a => !a.group_id);

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
                            onUpdate={(key, value) => onUpdateActivity(instanceId, { [key]: value })}
                            onFocus={() => onFocusActivity(instance)}
                            isSelected={selectedActivityId === instanceId}
                            rootId={rootId}
                            canMoveUp={sectionIndex > 0 || (section.activity_ids.indexOf(instanceId) > 0 && true)} // Simplified for now
                            canMoveDown={true}
                            showReorderButtons={true}
                            onNoteCreated={onNoteCreated}
                            sessionId={sessionId}
                            allNotes={allNotes}
                            onAddNote={onAddNote}
                            onUpdateNote={onUpdateNote}
                            onDeleteNote={onDeleteNote}
                        />
                    );
                })}

                {/* Add Activity Button / Selector */}
                {showActivitySelector ? (
                    <div style={{
                        background: '#252525',
                        padding: '16px',
                        borderRadius: '6px',
                        border: '1px solid #444',
                        animation: 'fadeIn 0.2s ease-in-out'
                    }}>
                        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#ddd' }}>
                                {viewGroupId === null ? 'Select Activity Group' :
                                    viewGroupId === 'ungrouped' ? 'Ungrouped Activities' :
                                        groupMap[viewGroupId]?.name || 'Group Activities'}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {viewGroupId !== null && (
                                    <button
                                        onClick={() => setViewGroupId(null)}
                                        style={{ background: 'none', border: '1px solid #555', color: '#ccc', cursor: 'pointer', fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}
                                    >
                                        ← Back
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        onToggleActivitySelector(false);
                                        setViewGroupId(null); // Reset on close
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Hierarchical View */}
                        {viewGroupId === null ? (
                            /* LEVEL 1: GROUPS */
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {/* Group Cards */}
                                {Object.entries(groupedActivities).map(([groupId, groupActivities]) => {
                                    const group = groupMap[groupId];
                                    if (!groupActivities.length) return null;
                                    return (
                                        <button
                                            key={groupId}
                                            onClick={() => setViewGroupId(groupId)}
                                            style={{
                                                padding: '12px 10px',
                                                background: '#333',
                                                border: '1px solid #555',
                                                borderRadius: '6px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '4px',
                                                transition: 'background 0.2s',
                                                textAlign: 'center'
                                            }}
                                            onMouseOver={(e) => e.target.style.background = '#444'}
                                            onMouseOut={(e) => e.target.style.background = '#333'}
                                        >
                                            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{group?.name || 'Unknown'}</div>
                                            <div style={{ fontSize: '10px', color: '#888' }}>{groupActivities.length} activities</div>
                                        </button>
                                    );
                                })}

                                {/* Ungrouped Card */}
                                {ungroupedActivities.length > 0 && (
                                    <button
                                        onClick={() => setViewGroupId('ungrouped')}
                                        style={{
                                            padding: '12px 10px',
                                            background: '#333',
                                            border: '1px dashed #666',
                                            borderRadius: '6px',
                                            color: '#ccc',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '4px',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <div style={{ fontSize: '13px', fontStyle: 'italic' }}>Ungrouped</div>
                                        <div style={{ fontSize: '10px', color: '#888' }}>{ungroupedActivities.length} activities</div>
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* LEVEL 2: ACTIVITIES */
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {(viewGroupId === 'ungrouped' ? ungroupedActivities : groupedActivities[viewGroupId] || []).map(act => (
                                    <button
                                        key={act.id}
                                        onClick={() => onAddActivity(sectionIndex, act.id)}
                                        style={{
                                            padding: '8px 14px',
                                            background: '#333',
                                            border: '1px solid #4caf50',
                                            borderRadius: '4px',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            textAlign: 'left',
                                            transition: 'transform 0.1s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                        onMouseDown={(e) => e.target.style.transform = 'scale(0.98)'}
                                        onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                                    >
                                        <span>+</span> {act.name}
                                    </button>
                                ))}
                                {(!groupedActivities[viewGroupId] && viewGroupId !== 'ungrouped' && (
                                    <div style={{ color: '#888', fontStyle: 'italic', padding: '10px' }}>No activities found in this group.</div>
                                ))}
                            </div>
                        )}

                        {/* Actions Footer (only on root) */}
                        {viewGroupId === null && (
                            <>
                                <div style={{ width: '100%', height: '1px', background: '#333', margin: '12px 0' }}></div>
                                <button
                                    onClick={() => onOpenActivityBuilder(sectionIndex)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#1a1a1a',
                                        border: '1px dashed #666',
                                        borderRadius: '4px',
                                        color: '#aaa',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 500
                                    }}
                                >
                                    + Create New Activity Definition
                                </button>
                            </>
                        )}
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
