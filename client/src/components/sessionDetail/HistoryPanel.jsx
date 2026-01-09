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
function ActivityHistoryCard({ instance, activityDef, formatDate }) {
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
                                {set.metrics?.map((m, mIdx) => (
                                    <span key={mIdx} className="history-metric">
                                        {m.value}
                                    </span>
                                ))}
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
            {instance.notes && (
                <div className="history-card-notes">
                    💬 {instance.notes}
                </div>
            )}
        </div>
    );
}

export default HistoryPanel;
