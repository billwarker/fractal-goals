/**
 * HistoryPanel - Activity history mode for SessionSidePane
 * 
 * Shows previous instances of the selected activity with their metrics.
 */

import React, { useMemo, useState } from 'react';
import { useActivityHistory } from '../../hooks/useActivityHistory';
import { useProgressHistory } from '../../hooks/useProgressHistory';
import { useTimezone } from '../../contexts/TimezoneContext';
import MarkdownNoteContent from '../notes/MarkdownNoteContent';
import styles from './HistoryPanel.module.css';

const HISTORY_LIMIT = 10;

function formatMetricNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue)) return String(numericValue);
    return numericValue.toFixed(1).replace(/\.0$/, '');
}

function HistoryPanel({ rootId, sessionId, selectedActivity, sessionActivityDefs }) {
    const [manualSelectedActivityId, setManualSelectedActivityId] = useState(null);
    const availableActivityIds = useMemo(
        () => sessionActivityDefs.map((definition) => definition.id),
        [sessionActivityDefs]
    );
    const selectedActivityId = useMemo(() => {
        const focusedActivityId = selectedActivity?.activity_definition_id;
        if (focusedActivityId && availableActivityIds.includes(focusedActivityId)) {
            return focusedActivityId;
        }
        if (manualSelectedActivityId && availableActivityIds.includes(manualSelectedActivityId)) {
            return manualSelectedActivityId;
        }
        return availableActivityIds[0] || null;
    }, [availableActivityIds, manualSelectedActivityId, selectedActivity]);

    const { history, loading, error } = useActivityHistory(
        rootId,
        selectedActivityId,
        sessionId, // Exclude current session
        { limit: HISTORY_LIMIT }
    );
    const {
        progressHistory,
        isLoading: progressLoading,
        error: progressError,
    } = useProgressHistory(
        rootId,
        selectedActivityId,
        { limit: HISTORY_LIMIT, excludeSessionId: sessionId }
    );
    const progressByInstanceId = useMemo(() => new Map(
        (progressHistory || [])
            .filter((record) => record?.activity_instance_id)
            .map((record) => [record.activity_instance_id, record])
    ), [progressHistory]);

    const { timezone } = useTimezone();

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
        } catch {
            return '';
        }
    };

    // Get selected activity definition name
    const selectedDef = sessionActivityDefs.find(d => d.id === selectedActivityId);

    return (
        <div className={styles.historyPanel}>
            {/* Activity Selector */}
            <div className={styles.historySelector}>
                <label>Select Activity:</label>
                <select
                    value={selectedActivityId || ''}
                    onChange={(e) => setManualSelectedActivityId(e.target.value || null)}
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
            <div className={styles.historyContent}>
                {!selectedActivityId ? (
                    <div className={styles.historyEmpty}>
                        Select an activity to view previous sessions
                    </div>
                ) : (loading || progressLoading) ? (
                    <div className={styles.historyLoading}>Loading history...</div>
                ) : (error || progressError) ? (
                    <div className={styles.historyError}>Error: {error || progressError?.message || progressError}</div>
                ) : history.length > 0 ? (
                    <div className={styles.historyList}>
                        {history.map(instance => (
                            <ActivityHistoryCard
                                key={instance.id}
                                instance={instance}
                                activityDef={selectedDef}
                                progressRecord={
                                    progressByInstanceId.get(instance.id)
                                    || progressByInstanceId.get(instance.activity_instance_id)
                                    || progressByInstanceId.get(instance.instance_id)
                                    || null
                                }
                                formatDate={formatDate}
                                timezone={timezone}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={styles.historyEmpty}>
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
function ActivityHistoryCard({ instance, activityDef, progressRecord, formatDate, timezone }) {
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
        } catch {
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

    const progressComparisons = Array.isArray(progressRecord?.metric_comparisons)
        ? progressRecord.metric_comparisons
        : [];

    const renderProgressIndicator = (metricId, metricName) => {
        const comparison = progressComparisons.find((item) => (
            item?.metric_id === metricId
            || item?.metric_definition_id === metricId
            || item?.metric_name === metricName
        ));
        if (!comparison) return null;

        const pctChange = comparison.pct_change ?? comparison.percent_delta;
        const improved = comparison.improved ?? comparison.is_improvement ?? false;
        const regressed = comparison.regressed ?? comparison.is_regression ?? false;

        if (pctChange != null) {
            const formatted = formatMetricNumber(Math.abs(pctChange));
            if (improved) return { label: `(▲${formatted}%)`, tone: 'improved' };
            if (regressed) return { label: `(▼${formatted}%)`, tone: 'regressed' };
            return { label: '(0%)', tone: 'neutral' };
        }

        const deltaValue = comparison.delta ?? comparison.value_delta;
        if (deltaValue == null) return null;

        const delta = Number(deltaValue);
        const formatted = formatMetricNumber(Math.abs(delta));
        if (delta > 0) return { label: `(+${formatted})`, tone: 'improved' };
        if (delta < 0) return { label: `(-${formatted})`, tone: 'regressed' };
        return { label: '(0)', tone: 'neutral' };
    };

    const renderMetricRow = (label, indicator) => {
        const indicatorClassName = indicator?.tone === 'improved'
            ? styles.historyProgressImproved
            : indicator?.tone === 'regressed'
                ? styles.historyProgressRegressed
                : styles.historyProgressNeutral;

        return (
            <span className={styles.historyMetricRow}>
                <span className={styles.historyMetric}>{label}</span>
                {indicator ? (
                    <span className={`${styles.historyProgressIndicator} ${indicatorClassName}`}>
                        {indicator.label}
                    </span>
                ) : null}
            </span>
        );
    };

    return (
        <div className={styles.historyCard}>
            <div className={styles.historyCardHeader}>
                <span className={styles.historyCardDate}>
                    {formatDate(instance.session_date || instance.created_at)}
                </span>
                {duration && (
                    <span className={styles.historyCardDuration}>⏱ {duration}</span>
                )}
            </div>

            {instance.session_name && (
                <div className={styles.historyCardSession}>
                    {instance.session_name}
                </div>
            )}

            {/* Display sets if present */}
            {sets.length > 0 && (
                <div className={styles.historyCardSets}>
                    {sets.map((set, idx) => (
                        <div key={set.instance_id || idx} className={styles.historySet}>
                            <span className={styles.historySetNum}>#{idx + 1}</span>
                            <div className={styles.historySetMetrics}>
                                {set.metrics?.map((m, mIdx) => {
                                    const def = activityDef?.metric_definitions?.find(d => d.id === m.metric_id);
                                    const metricLabel = (
                                        <>
                                            {def?.name && <span className={styles.metricLabel}>{def.name}:</span>}
                                            {m.value}
                                            {def?.unit && <span className={styles.metricUnit}>{def.unit}</span>}
                                        </>
                                    );
                                    return (
                                        <React.Fragment key={mIdx}>
                                            {renderMetricRow(metricLabel, renderProgressIndicator(m.metric_id, def?.name))}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Display metrics if no sets */}
            {sets.length === 0 && hasMetrics && (
                <div className={styles.historyCardMetrics}>
                    {instance.metric_values.map((mv, idx) => (
                        <React.Fragment key={idx}>
                            {renderMetricRow(
                                <>{mv.name}: {mv.value} {mv.unit}</>,
                                renderProgressIndicator(mv.metric_definition_id || mv.metric_id, mv.name)
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Notes preview */}
            {instance.notes && instance.notes.length > 0 && (
                <div className={styles.historyCardNotes}>
                    {instance.notes.map((note, nIdx) => (
                        <div key={note.id || nIdx} className={styles.noteRow}>
                            <span className={styles.noteTime}>
                                {formatTime(note.created_at)}
                            </span>
                            {note.set_index !== null && note.set_index !== undefined && (
                                <span className={styles.noteSetBadge}>
                                    Set {note.set_index + 1}
                                </span>
                            )}
                            <MarkdownNoteContent content={note.content} className={styles.noteContent} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default HistoryPanel;
