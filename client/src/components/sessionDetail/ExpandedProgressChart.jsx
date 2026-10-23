import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS } from 'chart.js';

import useProgressHover from '../../hooks/useProgressHover';
import pageGridSnap from '../analytics/pageGridSnap';
import Button from '../atoms/Button';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import { describeComparison, previewChoice } from './ProgressCompareControls';
import { progressAnalyticsHref, progressChartHeading, useFadingProgressSeries } from './ProgressChart';
import styles from './ExpandedProgressChart.module.css';

// Expanded charts snap to the page grid (see applyChartDensity's 'expanded').
ChartJS.register(pageGridSnap);

/**
 * The Progress pane's chart at full detail, in place of the session content and drawn on the
 * page's background grid. It follows the pane's live comparison, so changing tags or scope there
 * redraws it. Escape or "Back to session" closes it.
 */
export default function ExpandedProgressChart({ rootId, chart, instances = [], activityDefs = [], onClose, isLeaving = false }) {
    const rootRef = useRef(null);
    // Fades in after mounting (and out while leaving), like the session content.
    const [isShown, setIsShown] = useState(false);
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

    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (event.target.closest?.('[role="dialog"], [role="menu"]')) return;
            onClose();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    const activityName = activityDefs.find((definition) => definition.id === chart.activityId)?.name
        || data?.activity_definition?.name || 'Activity';
    const series = data?.chart?.condition ? data : null;
    const { scope, summary } = instance ? describeComparison(instance, null) : {};
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
                        {series ? <span className={styles.titleDetail}> · {progressChartHeading(series.chart)}</span> : null}
                    </h2>
                    {scope ? (
                        <div className={styles.scope}>
                            <span>{scope}</span>
                            <span className={styles.scopeTags}>{summary}</span>
                        </div>
                    ) : null}
                </div>
                <div className={styles.actions}>
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
                    <ConditionProgressChart
                        condition={series.chart.condition}
                        instances={series.instances}
                        activity={series.activity_definition}
                        density="expanded"
                        highlightInstanceId={series.current_instance_id}
                        hoverInstanceId={hoverInstanceId}
                    />
                ) : null}
            </div>
        </section>
    );
}
