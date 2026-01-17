/**
 * HistoryPanel - Activity history mode for SessionSidePane
 * 
 * Shows previous instances of the selected activity with their metrics.
 */

import React, { useState, useEffect } from 'react';
import { useActivityHistory } from '../../hooks/useActivityHistory';
import { useTimezone } from '../../contexts/TimezoneContext';

function HistoryPanel({ rootId, sessionId, selectedActivity, sessionActivityDefs }) {
    // Default to selected activity's definition, or first in list
    const [selectedActivityId, setSelectedActivityId] = useState(
        selectedActivity?.activity_definition_id || sessionActivityDefs[0]?.id || null
    );

    // Update selection when selectedActivity changes
    useEffect(() => {
        if (selectedActivity?.activity_definition_id) {
            setSelectedActivityId(selectedActivity.activity_definition_id);
        }
    }, [selectedActivity]);

    const { history, loading, error } = useActivityHistory(
        rootId,
        selectedActivityId,
        sessionId // Exclude current session
    );

    const timezone = useTimezone();

    const formatDate = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: timezone
            });
        } catch (e) {
            return '';
        }
    };

    // Get selected activity definition name
    const selectedDef = sessionActivityDefs.find(d => d.id === selectedActivityId);

    return (
        <div className="history-panel">
            {/* Activity Selector */}
            <div className="history-selector">
                <label>Select Activity:</label>
                <select
                    value={selectedActivityId || ''}
                    onChange={(e) => setSelectedActivityId(e.target.value || null)}
                >
                    {sessionActivityDefs.length === 0 ? (
                        <option value="">No activities in session</option>
                    ) : (
                        sessionActivityDefs.map(def => (
                            <option key={def.id} value={def.id}>
                                {def.name}
                            </option>
                        ))
                    )}
                </select>
            </div>

            {/* History Content */}
            <div className="history-content">
                {!selectedActivityId ? (
                    <div className="history-empty">
                        Select an activity to view previous sessions
                    </div>
                ) : loading ? (
                    <div className="history-loading">Loading history...</div>
                ) : error ? (
                    <div className="history-error">Error: {error}</div>
                ) : history.length > 0 ? (
                    <div className="history-list">
                        {history.map(instance => (
                            <ActivityHistoryCard
                                key={instance.id}
                                instance={instance}
                                activityDef={selectedDef}
                                formatDate={formatDate}
                                timezone={timezone}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="history-empty">
                        No previous sessions found for {selectedDef?.name || 'this activity'}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * ActivityHistoryCard - Display a previous activity instance
 */
function ActivityHistoryCard({ instance, activityDef, formatDate, timezone }) {
    // Parse sets from instance data
    const sets = instance.sets || [];
    const hasMetrics = instance.metric_values && instance.metric_values.length > 0;

    // Format duration
    const formatDuration = (seconds) => {
        if (!seconds) return null;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    // Format time for notes
    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            return new Date(isoString).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone
            });
        } catch (e) {
            return '';
        }
    };

    // Calculate duration from time_start and time_stop
    const duration = (() => {
        if (instance.time_start && instance.time_stop) {
            const start = new Date(instance.time_start);
            const stop = new Date(instance.time_stop);
            const seconds = Math.floor((stop - start) / 1000);
            return formatDuration(seconds);
        }
        return instance.duration_seconds ? formatDuration(instance.duration_seconds) : null;
    })();

    return (
        <div className="history-card">
            <div className="history-card-header">
                <span className="history-card-date">
                    {formatDate(instance.session_date || instance.created_at)}
                </span>
                {duration && (
                    <span className="history-card-duration">⏱ {duration}</span>
                )}
            </div>

            {instance.session_name && (
                <div className="history-card-session">
                    {instance.session_name}
                </div>
            )}

            {/* Display sets if present */}
            {sets.length > 0 && (
                <div className="history-card-sets">
                    {sets.map((set, idx) => (
                        <div key={set.instance_id || idx} className="history-set">
                            <span className="history-set-num">#{idx + 1}</span>
                            <div className="history-set-metrics">
                                {set.metrics?.map((m, mIdx) => {
                                    const def = activityDef?.metric_definitions?.find(d => d.id === m.metric_id);
                                    return (
                                        <span key={mIdx} className="history-metric">
                                            {def?.name && <span style={{ opacity: 0.7, marginRight: '4px' }}>{def.name}:</span>}
                                            {m.value}
                                            {def?.unit && <span style={{ opacity: 0.7, marginLeft: '2px' }}>{def.unit}</span>}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Display metrics if no sets */}
            {sets.length === 0 && hasMetrics && (
                <div className="history-card-metrics">
                    {instance.metric_values.map((mv, idx) => (
                        <span key={idx} className="history-metric">
                            {mv.name}: {mv.value} {mv.unit}
                        </span>
                    ))}
                </div>
            )}

            {/* Notes preview */}
            {instance.notes && instance.notes.length > 0 && (
                <div className="history-card-notes">
                    {instance.notes.map((note, nIdx) => (
                        <div key={note.id || nIdx} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginTop: '4px' }}>
                            <span style={{ color: '#666', fontSize: '11px', minWidth: '50px' }}>
                                {formatTime(note.created_at)}
                            </span>
                            {note.set_index !== null && note.set_index !== undefined && (
                                <span style={{
                                    fontSize: '10px',
                                    background: '#333',
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    color: '#aaa',
                                    flexShrink: 0
                                }}>
                                    Set {note.set_index + 1}
                                </span>
                            )}
                            <span style={{ color: '#aaa', fontSize: '12px' }}>
                                {note.content}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default HistoryPanel;
