import React, { useEffect, useState } from 'react';

import useProgressHover from '../../hooks/useProgressHover';
import { activityChartToSave } from '../analytics/chartGoalTargets';
import ExpandedChartFrame from '../analytics/ExpandedChartFrame';
import Button from '../atoms/Button';
import { describeComparison, previewChoice } from './ProgressCompareControls';
import { progressAnalyticsHref, useFadingProgressSeries } from './ProgressChart';
import ProgressChartView, { progressGoalChart } from './ProgressChartView';
import { progressChartTitle } from './progressChartSettings';
import styles from './ExpandedProgressChart.module.css';

/**
 * The Progress pane's chart at full detail, in place of the session content and drawn on the
 * page's background grid. It follows the pane's live comparison, so changing tags or scope there
 * redraws it. Escape or "Back to session" closes it. A chart of one value per session or a scatter can
 * set a goal, as in Analytics; Escape then leaves that mode first.
 */
export default function ExpandedProgressChart({ rootId, chart, instances = [], activityDefs = [], onClose, isLeaving = false }) {
    const [isAnnotating, setIsAnnotating] = useState(false);
    const instance = instances.find((row) => row.id === chart.instanceId) || null;
    const choice = instance ? previewChoice(instance) : null;
    const { data, visible } = useFadingProgressSeries(rootId, chart.activityId, chart.instanceId, choice);
    const hoverInstanceId = useProgressHover();
    // The instance left the session (deleted elsewhere): nothing to chart, so back to the session.
    const isGone = !instance && instances.length > 0;
    useEffect(() => {
        if (isGone) onClose();
    }, [isGone, onClose]);

    const activityName = activityDefs.find((definition) => definition.id === chart.activityId)?.name
        || data?.activity_definition?.name || 'Activity';
    const series = data?.chart_settings ? data : null;
    const { scope, summary } = instance ? describeComparison(instance, null) : {};
    const goalChart = series ? progressGoalChart(series) : null;
    // Changing to a chart that can't set a goal leaves the mode.
    if (isAnnotating && !goalChart) setIsAnnotating(false);
    return (
        <ExpandedChartFrame
            className={styles.placed}
            ariaLabel={`${activityName} progress chart`}
            testId="expanded-progress-chart"
            title={activityName}
            titleDetail={series ? progressChartTitle(series) : null}
            subtitle={scope ? (
                <div className={styles.scope}>
                    <span>{scope}</span>
                    <span className={styles.scopeTags}>{summary}</span>
                </div>
            ) : null}
            setGoal={goalChart ? { annotating: isAnnotating, onToggle: () => setIsAnnotating((current) => !current) } : null}
            analyticsHref={series && instance ? progressAnalyticsHref(rootId, chart.activityId, series, instance, choice) : null}
            actions={<Button variant="ghost" size="sm" onClick={onClose}>Back to session</Button>}
            onClose={onClose}
            isLeaving={isLeaving}
            chartVisible={visible}
        >
            {series ? (
                <ProgressChartView
                    rootId={rootId}
                    series={series}
                    density="expanded"
                    hoverInstanceId={hoverInstanceId}
                    goalSurface={goalChart ? {
                        annotating: isAnnotating,
                        onAnnotatingChange: setIsAnnotating,
                        chartToSave: activityChartToSave(goalChart, series.chart_settings, series.activity_definition),
                    } : null}
                />
            ) : null}
        </ExpandedChartFrame>
    );
}
