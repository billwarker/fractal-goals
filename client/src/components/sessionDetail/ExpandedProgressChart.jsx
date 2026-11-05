import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS } from 'chart.js';

import useProgressHover from '../../hooks/useProgressHover';
import SetGoalButton from '../analytics/annotate/SetGoalButton';
import axisExtension from '../analytics/axisExtension';
import pageGridSnap from '../analytics/pageGridSnap';
import Button from '../atoms/Button';
import { describeComparison, previewChoice } from './ProgressCompareControls';
import { progressAnalyticsHref, useFadingProgressSeries } from './ProgressChart';
import ProgressChartView, { progressGoalChart } from './ProgressChartView';
import { progressChartTitle } from './progressChartSettings';
import styles from './ExpandedProgressChart.module.css';

// Expanded charts snap to the page grid (see applyChartDensity's 'expanded').
ChartJS.register(pageGridSnap, axisExtension);

/** This chart as an Analytics view, for a goal set from it to show. */
function chartToSaveFor(goalChart, settings, activity) {
    const scatter = goalChart.id === 'scatterPlot';
    return {
        windowState: {
            selectedCategory: 'activities',
            selectedVisualization: goalChart.id,
            selectedActivity: { id: activity.id, name: activity.name },
            visualizationState: {
                setsHandling: goalChart.setsHandling,
                ...(scatter ? { metricX: settings.x_metric_id, metricY: settings.y_metric_id } : { metrics: goalChart.metrics }),
            },
        },
        globalFilters: null,
        reusableViewId: null,
    };
}

/**
 * The Progress pane's chart at full detail, in place of the session content and drawn on the
 * page's background grid. It follows the pane's live comparison, so changing tags or scope there
 * redraws it. Escape or "Back to session" closes it. A chart of one value per session or a scatter can
 * set a goal, as in Analytics; Escape then leaves that mode first.
 */
export default function ExpandedProgressChart({ rootId, chart, instances = [], activityDefs = [], onClose, isLeaving = false }) {
    const rootRef = useRef(null);
    // Fades in after mounting (and out while leaving), like the session content.
    const [isShown, setIsShown] = useState(false);
    const [isAnnotating, setIsAnnotating] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsShown(true));
        return () => cancelAnimationFrame(frame);
    }, []);
    const instance = instances.find((row) => row.id === chart.instanceId) || null;
    const choice = instance ? previewChoice(instance) : null;
    const { data, visible } = useFadingProgressSeries(rootId, chart.activityId, chart.instanceId, choice);
    const hoverInstanceId = useProgressHover();
    // The instance left the session (deleted elsewhere): nothing to chart, so back to the session.
    const isGone = !instance && instances.length > 0;
    useEffect(() => {
        if (isGone) onClose();
    }, [isGone, onClose]);

    const isAnnotatingRef = useRef(false);
    useEffect(() => {
        isAnnotatingRef.current = isAnnotating;
    }, [isAnnotating]);

    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented || isAnnotatingRef.current) return;
            if (event.target.closest?.('[role="dialog"], [role="menu"]')) return;
            onClose();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    const activityName = activityDefs.find((definition) => definition.id === chart.activityId)?.name
        || data?.activity_definition?.name || 'Activity';
    const series = data?.chart_settings ? data : null;
    const { scope, summary } = instance ? describeComparison(instance, null) : {};
    const goalChart = series ? progressGoalChart(series) : null;
    // Changing to a chart that can't set a goal leaves the mode.
    if (isAnnotating && !goalChart) setIsAnnotating(false);
    return (
        <section
            ref={rootRef}
            className={styles.expanded}
            aria-label={`${activityName} progress chart`}
            tabIndex={-1}
            data-testid="expanded-progress-chart"
            data-visible={isShown && !isLeaving}
        >
            <div className={styles.header}>
                <div className={styles.titles}>
                    <h2 className={styles.title}>
                        {activityName}
                        {series ? <span className={styles.titleDetail}> · {progressChartTitle(series)}</span> : null}
                    </h2>
                    {scope ? (
                        <div className={styles.scope}>
                            <span>{scope}</span>
                            <span className={styles.scopeTags}>{summary}</span>
                        </div>
                    ) : null}
                </div>
                <div className={styles.actions}>
                    {goalChart ? <SetGoalButton annotating={isAnnotating} onToggle={() => setIsAnnotating((current) => !current)} /> : null}
                    {series && instance ? (
                        <Link className={styles.analyticsLink} to={progressAnalyticsHref(rootId, chart.activityId, series, instance, choice)}>
                            Open in Analytics
                        </Link>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={onClose}>Back to session</Button>
                </div>
            </div>
            <div className={styles.chart} data-visible={visible}>
                {series ? (
                    <ProgressChartView
                        rootId={rootId}
                        series={series}
                        density="expanded"
                        hoverInstanceId={hoverInstanceId}
                        goalSurface={goalChart ? {
                            annotating: isAnnotating,
                            onAnnotatingChange: setIsAnnotating,
                            chartToSave: chartToSaveFor(goalChart, series.chart_settings, series.activity_definition),
                        } : null}
                    />
                ) : null}
            </div>
        </section>
    );
}
