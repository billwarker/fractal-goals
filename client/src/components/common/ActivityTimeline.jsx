import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import MarkdownNoteContent from '../notes/MarkdownNoteContent';
import {
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
} from '../../utils/progressAggregations';
import styles from './ActivityTimeline.module.css';

function formatMetricNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue)) return String(numericValue);
    return numericValue.toFixed(1).replace(/\.0$/, '');
}

function formatDuration(seconds) {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function defaultFormatDate(isoString, timezone) {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: timezone,
        });
    } catch {
        return '';
    }
}

function formatTime(isoString, timezone) {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
        });
    } catch {
        return '';
    }
}

export function ActivityTimelineList({
    items,
    activityDef,
    progressByInstanceId,
    formatDate,
    timezone,
    deltaDisplayMode = 'percent',
    showActivityName = false,
    getSessionHref = null,
}) {
    return (
        <div className={styles.timelineList}>
            {items.map((instance) => (
                <ActivityTimelineCard
                    key={instance.id}
                    instance={instance}
                    activityDef={activityDef}
                    progressRecord={
                        progressByInstanceId?.get(instance.id)
                        || progressByInstanceId?.get(instance.activity_instance_id)
                        || progressByInstanceId?.get(instance.instance_id)
                        || instance.progress_comparison
                        || instance.progress_record
                        || null
                    }
                    formatDate={formatDate}
                    timezone={timezone}
                    deltaDisplayMode={deltaDisplayMode}
                    showActivityName={showActivityName}
                    sessionHref={getSessionHref?.(instance)}
                />
            ))}
        </div>
    );
}

export function ActivityTimelineCard({
    instance,
    activityDef,
    progressRecord,
    formatDate,
    timezone,
    deltaDisplayMode = 'percent',
    showActivityName = false,
    sessionHref = null,
}) {
    const sets = useMemo(() => instance.sets || [], [instance.sets]);
    const hasMetrics = instance.metric_values && instance.metric_values.length > 0;
    const metricDefs = useMemo(() => activityDef?.metric_definitions || [], [activityDef?.metric_definitions]);
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);

    const autoAgg = useMemo(() => {
        const fromRecord = progressRecord?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        if (sets.length === 0 || trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(sets, trackedMetricDefs);
    }, [progressRecord, sets, trackedMetricDefs]);

    const prevAutoAgg = progressRecord?.derived_summary?.prev_auto_aggregations ?? null;
    const multDefs = trackedMetricDefs.filter((md) => md.is_multiplicative);
    const hasYield = multDefs.length >= 2 && autoAgg?.total_yield != null;

    const yieldBySetIndex = useMemo(() => {
        if (!autoAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of autoAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [autoAgg]);

    const prevYieldBySetIndex = useMemo(() => {
        if (!prevAutoAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of prevAutoAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [prevAutoAgg]);

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

    const renderProgressIndicator = (metricId, metricName, setIndex) => {
        const comparison = progressComparisons.find((item) => (
            item?.metric_id === metricId
            || item?.metric_definition_id === metricId
            || item?.metric_name === metricName
        ));
        if (!comparison) return null;

        let pctChange, improved, regressed;
        if (setIndex != null && Array.isArray(comparison.set_comparisons) && comparison.set_comparisons.length > 0) {
            const setComp = comparison.set_comparisons.find((sc) => sc.set_index === setIndex);
            if (setComp) {
                pctChange = setComp.pct_change;
                improved = setComp.improved ?? false;
                regressed = setComp.regressed ?? false;
            } else {
                return null;
            }
        } else {
            pctChange = comparison.pct_change ?? comparison.percent_delta;
            improved = comparison.improved ?? comparison.is_improvement ?? false;
            regressed = comparison.regressed ?? comparison.is_regression ?? false;
        }

        const deltaValue = comparison.delta ?? comparison.value_delta;

        if (deltaDisplayMode === 'absolute') {
            if (deltaValue == null) return null;
            const delta = Number(deltaValue);
            const formatted = formatMetricNumber(Math.abs(delta));
            const tone = improved ? 'improved' : regressed ? 'regressed' : 'neutral';
            if (delta > 0) return { label: `(+${formatted})`, tone };
            if (delta < 0) return { label: `(-${formatted})`, tone };
            return { label: '(0)', tone: 'neutral' };
        }

        if (pctChange != null) {
            const formatted = formatMetricNumber(Math.abs(pctChange));
            if (improved) return { label: `(▲${formatted}%)`, tone: 'improved' };
            if (regressed) return { label: `(▼${formatted}%)`, tone: 'regressed' };
            return { label: '(0%)', tone: 'neutral' };
        }

        if (deltaValue == null) return null;
        const delta = Number(deltaValue);
        const formatted = formatMetricNumber(Math.abs(delta));
        if (delta > 0) return { label: `(+${formatted})`, tone: 'improved' };
        if (delta < 0) return { label: `(-${formatted})`, tone: 'regressed' };
        return { label: '(0)', tone: 'neutral' };
    };

    const renderYieldDelta = (current, previous) => {
        if (previous == null || current == null) return null;
        const delta = current - previous;
        if (Math.abs(delta) < 0.001) return { label: deltaDisplayMode === 'absolute' ? '(0)' : '(0%)', tone: 'neutral' };
        if (deltaDisplayMode === 'absolute') {
            const formatted = formatMetricNumber(Math.abs(delta));
            if (delta > 0) return { label: `(+${formatted})`, tone: 'improved' };
            return { label: `(-${formatted})`, tone: 'regressed' };
        }
        if (previous === 0) {
            const formatted = formatMetricNumber(Math.abs(delta));
            if (delta > 0) return { label: `(+${formatted})`, tone: 'improved' };
            return { label: `(-${formatted})`, tone: 'regressed' };
        }
        const pct = Math.abs((delta / previous) * 100);
        const formatted = formatMetricNumber(pct);
        if (delta > 0) return { label: `(▲${formatted}%)`, tone: 'improved' };
        return { label: `(▼${formatted}%)`, tone: 'regressed' };
    };

    const renderMetricRow = (label, indicator) => {
        const indicatorClassName = indicator?.tone === 'improved'
            ? styles.timelineProgressImproved
            : indicator?.tone === 'regressed'
                ? styles.timelineProgressRegressed
                : styles.timelineProgressNeutral;

        return (
            <span className={styles.timelineMetricRow}>
                <span className={styles.timelineMetric}>{label}</span>
                {indicator ? (
                    <span className={`${styles.timelineProgressIndicator} ${indicatorClassName}`}>
                        {indicator.label}
                    </span>
                ) : null}
            </span>
        );
    };

    return (
        <div className={styles.timelineCard}>
            <div className={styles.timelineCardHeader}>
                <span className={styles.timelineCardDate}>
                    {(formatDate || ((value) => defaultFormatDate(value, timezone)))(instance.session_date || instance.created_at)}
                </span>
                {duration && (
                    <span className={styles.timelineCardDuration}>⏱ {duration}</span>
                )}
            </div>

            {instance.session_name && (
                sessionHref ? (
                    <Link
                        to={sessionHref}
                        className={styles.timelineCardSessionLink}
                        title={`Open ${instance.session_name}`}
                    >
                        {instance.session_name}
                    </Link>
                ) : (
                    <div className={styles.timelineCardSession}>
                        {instance.session_name}
                    </div>
                )
            )}

            {showActivityName && (instance.name || instance.definition_name) && (
                <div className={styles.timelineCardActivityName}>
                    {instance.name || instance.definition_name}
                </div>
            )}

            {sets.length > 0 && (
                <div className={styles.timelineCardSets}>
                    {sets.map((set, idx) => (
                        <div
                            key={set.instance_id || idx}
                            className={`${styles.timelineSet} ${autoAgg?.best_set_index === idx ? styles.timelineSetBest : ''}`}
                        >
                            <span className={styles.timelineSetNum}>#{idx + 1}</span>
                            <div className={styles.timelineSetMetrics}>
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
                                            {renderMetricRow(metricLabel, renderProgressIndicator(m.metric_id, def?.name, idx))}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            {yieldBySetIndex?.[idx] != null && (() => {
                                const currYield = yieldBySetIndex[idx];
                                const prevYield = prevYieldBySetIndex?.[idx];
                                const indicator = !progressRecord?.is_first_instance
                                    ? renderYieldDelta(currYield, prevYield)
                                    : null;
                                const indicatorClass = indicator?.tone === 'improved'
                                    ? styles.timelineProgressImproved
                                    : indicator?.tone === 'regressed'
                                        ? styles.timelineProgressRegressed
                                        : styles.timelineProgressNeutral;
                                return (
                                    <span className={styles.timelineSetYield}>
                                        Yield: {formatAggValue(currYield)}
                                        {indicator && (
                                            <span className={`${styles.timelineProgressIndicator} ${indicatorClass}`}>
                                                {' '}{indicator.label}
                                            </span>
                                        )}
                                    </span>
                                );
                            })()}
                        </div>
                    ))}

                    {(hasYield || autoAgg?.best_set_index != null) && (
                        <div className={styles.timelineAggSummary}>
                            {hasYield && (() => {
                                const totalIndicator = !progressRecord?.is_first_instance
                                    ? renderYieldDelta(autoAgg.total_yield, prevAutoAgg?.total_yield)
                                    : null;
                                const totalIndicatorClass = totalIndicator?.tone === 'improved'
                                    ? styles.timelineProgressImproved
                                    : totalIndicator?.tone === 'regressed'
                                        ? styles.timelineProgressRegressed
                                        : styles.timelineProgressNeutral;
                                return (
                                    <span className={styles.timelineAggItem}>
                                        <span className={styles.timelineAggLabel}>Total yield:</span>
                                        <span className={styles.timelineAggValue}>{formatAggValue(autoAgg.total_yield)}</span>
                                        {totalIndicator && (
                                            <span className={`${styles.timelineProgressIndicator} ${totalIndicatorClass}`}>
                                                {totalIndicator.label}
                                            </span>
                                        )}
                                    </span>
                                );
                            })()}
                            {autoAgg?.best_set_index != null && (
                                <span className={styles.timelineAggItem}>
                                    <span className={styles.timelineAggLabel}>Best:</span>
                                    <span className={styles.timelineAggValue}>
                                        Set {autoAgg.best_set_index + 1}
                                        {hasYield && autoAgg.best_set_yield != null
                                            ? ` · ${formatAggValue(autoAgg.best_set_yield)}`
                                            : metricDefs
                                                .filter((md) => autoAgg.best_set_values?.[md.id] != null)
                                                .map((md) => ` · ${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                                                .join('')
                                        }
                                    </span>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {sets.length === 0 && hasMetrics && (
                <div className={styles.timelineCardMetrics}>
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

            {instance.notes && instance.notes.length > 0 && (
                <div className={styles.timelineCardNotes}>
                    {instance.notes.map((note, nIdx) => (
                        <div key={note.id || nIdx} className={styles.noteRow}>
                            <span className={styles.noteTime}>
                                {formatTime(note.created_at, timezone)}
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

export default ActivityTimelineList;
