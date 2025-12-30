import React from 'react';

/**
 * Activity Card Component - Display activity as a tile
 */
function ActivityCard({ activity, lastInstantiated, onEdit, onDuplicate, onDelete, isCreating }) {
    const formatLastUsed = (timestamp) => {
        if (!timestamp) return 'Never used';

        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    };

    return (
        <div
            style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'all 0.2s ease',
                cursor: 'default'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#555';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Header */}
            <div>
                <h3 style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    marginBottom: '3px',
                    color: 'white'
                }}>
                    {activity.name}
                </h3>
                {activity.description && (
                    <p style={{
                        fontSize: '12px',
                        color: '#aaa',
                        marginBottom: '4px',
                        lineHeight: '1.3'
                    }}>
                        {activity.description}
                    </p>
                )}
                <div style={{
                    fontSize: '11px',
                    color: '#666',
                    fontStyle: 'italic'
                }}>
                    Last used: {formatLastUsed(lastInstantiated)}
                </div>
            </div>

            {/* Indicators */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {activity.has_sets && (
                    <span style={{
                        fontSize: '11px',
                        background: '#333',
                        color: '#ff9800',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: '1px solid #444',
                        fontWeight: 500
                    }}>
                        Sets
                    </span>
                )}
                {activity.has_splits && (
                    <span style={{
                        fontSize: '11px',
                        background: '#333',
                        color: '#7B5CFF',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: '1px solid #444',
                        fontWeight: 500
                    }}>
                        Splits
                    </span>
                )}
                {(!activity.metric_definitions || activity.metric_definitions.length === 0) && (
                    <span style={{
                        fontSize: '11px',
                        background: '#333',
                        color: '#888',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: '1px solid #444',
                        fontWeight: 500
                    }}>
                        No Metrics
                    </span>
                )}
                {activity.metrics_multiplicative && (
                    <span style={{
                        fontSize: '11px',
                        background: '#333',
                        color: '#f44336',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: '1px solid #444',
                        fontWeight: 500
                    }}>
                        Multiplicative
                    </span>
                )}
                {activity.metric_definitions?.map(m => (
                    <span
                        key={m.id}
                        style={{
                            fontSize: '11px',
                            background: '#1a1a1a',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            color: '#4caf50',
                            border: '1px solid #333',
                            fontWeight: 500
                        }}
                    >
                        {m.name} ({m.unit})
                    </span>
                ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    onClick={() => onEdit(activity)}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: '#2196f3',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1976d2'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#2196f3'}
                >
                    Edit
                </button>
                <button
                    onClick={() => onDuplicate(activity)}
                    disabled={isCreating}
                    style={{
                        padding: '8px 12px',
                        background: isCreating ? '#666' : '#ff9800',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '14px',
                        cursor: isCreating ? 'not-allowed' : 'pointer',
                        opacity: isCreating ? 0.5 : 1,
                        transition: 'background 0.2s'
                    }}
                    title="Duplicate this activity"
                    onMouseEnter={(e) => !isCreating && (e.currentTarget.style.background = '#f57c00')}
                    onMouseLeave={(e) => !isCreating && (e.currentTarget.style.background = '#ff9800')}
                >
                    ⎘
                </button>
                <button
                    onClick={() => onDelete(activity)}
                    style={{
                        padding: '8px 12px',
                        background: '#d32f2f',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#b71c1c'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#d32f2f'}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default ActivityCard;
