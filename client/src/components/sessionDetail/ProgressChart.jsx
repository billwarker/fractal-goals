import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useActivityProgressSeries } from '../../hooks/useActivityTags';
import useFadeSwap from '../../hooks/useFadeSwap';
import useProgressHover from '../../hooks/useProgressHover';
import { buildAnalyticsLink } from '../../utils/analyticsDeepLink';
import { YIELD_METRIC_ID } from '../analytics/visualizations/activities/MetricTrends';
import ExpandableChartFrame from '../common/ExpandableChartFrame';
import ProgressChartControls from './ProgressChartControls';
import ProgressChartView from './ProgressChartView';
import { progressChartTitle, trendMetricIds } from './progressChartSettings';
import { useProgressChartExpansion } from './useExpandedProgressChart';
import styles from './ProgressPanel.module.css';

/** The metrics an Analytics Metric Trends chart plots for a goal condition (yield as its pseudo-metric). */
function goalMetricIds(chart) {
    const condition = chart?.condition;
    if (!condition) return [];
    if (condition.measure === 'yield') return [YIELD_METRIC_ID];
    if (condition.measure === 'sets') return (condition.rules || []).slice(0, 2).map((rule) => rule.metric_definition_id);
    return condition.metric_definition_id ? [condition.metric_definition_id] : [];
}

/** An arrow out of a box: "opens elsewhere". */
const OpenIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M9 2h5v5M14 2 8 8M7 3H3v10h10V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const settingsKey = (settings) => (settings
    ? [settings.kind, settings.trend_series, settings.metric_id, settings.x_metric_id, settings.y_metric_id, settings.set_aggregation].join('|')
    : '');

/**
 * The series for this comparison, cross-faded when the comparison, the activity or the chart
 * changes: the old chart fades out, and the new one fades in once it has loaded. `live` is the
 * latest payload (for controls, which shouldn't wait for the fade).
 */
export function useFadingProgressSeries(rootId, activityId, instanceId, choice) {
    const query = useActivityProgressSeries(rootId, activityId, { instanceId, preview: choice });
    const key = [activityId, instanceId, choice?.mode, [...(choice?.tagIds || [])].sort().join(','),
        Boolean(choice?.sameTemplate), Boolean(choice?.sameProgramDay), settingsKey(query.data?.chart_settings)].join(':');
    const fade = useFadeSwap(query.data, key, !query.isLoading && !query.isPlaceholderData);
    return { data: fade.value, live: query.data, visible: fade.visible, isLoading: query.isLoading };
}

/** The same chart in Analytics: this activity and chart, compared tags, template and program day. */
export function progressAnalyticsHref(rootId, activityId, series, instance, choice) {
    const context = instance.comparison_context || {};
    const settings = series.chart_settings || {};
    const scatter = settings.kind === 'scatter';
    return buildAnalyticsLink(rootId, {
        activityId,
        viz: scatter ? 'scatterPlot' : 'metricTrends',
        metricIds: settings.kind === 'goal' ? goalMetricIds(series.chart) : scatter ? [] : trendMetricIds(settings),
        metricX: scatter ? settings.x_metric_id : null,
        metricY: scatter ? settings.y_metric_id : null,
        setsHandling: settings.kind === 'goal' ? null : settings.set_aggregation,
        tagIds: choice.mode === 'all' ? null : choice.tagIds,
        tagMatch: 'exact',
        templateId: choice.sameTemplate ? context.template?.id : null,
        programDayId: choice.sameProgramDay ? context.program_day?.id : null,
    });
}

/**
 * A compact chart of the sessions this instance compares against, ending with this session. What
 * it plots (goal progress, an activity or metric trend, a scatter) is remembered for the activity
 * in this template/program day; while expanded, the card holds the chart's controls.
 */
export default function ProgressChart({ rootId, activityId, instance, choice }) {
    const navigate = useNavigate();
    const expansion = useProgressChartExpansion();
    const { data, live, visible, isLoading } = useFadingProgressSeries(rootId, activityId, instance.id, choice);
    const hoverInstanceId = useProgressHover();
    const hasChart = Boolean(data?.chart_settings);
    const expanded = expansion?.chart || null;
    // While expanded, the big chart follows the pane's selection, and goes when there's nothing to chart.
    useEffect(() => {
        if (!expanded || isLoading) return;
        if (!hasChart) expansion.collapse();
        else if (expanded.activityId !== activityId || expanded.instanceId !== instance.id) {
            expansion.expand({ activityId, instanceId: instance.id });
        }
    }, [activityId, expanded, expansion, hasChart, instance.id, isLoading]);
    if (isLoading || !hasChart) return null;
    const heading = progressChartTitle(data);
    // In Session Detail the card expands in the session's place; elsewhere it opens Analytics.
    const action = expansion
        ? { label: 'Expand chart', run: () => expansion.expand({ activityId, instanceId: instance.id }) }
        : { label: 'Open in Analytics', run: () => navigate(progressAnalyticsHref(rootId, activityId, data, instance, choice)) };
    return (
        <ExpandableChartFrame
            className={styles.progressChart}
            onExpand={action.run}
            label={`${heading}. ${action.label}`}
            title={action.label}
            icon={expansion ? null : <OpenIcon />}
            isExpanded={Boolean(expanded)}
            expandedNote="Showing in place of the session."
            expandedContent={live?.chart_settings ? (
                <ProgressChartControls rootId={rootId} activityId={activityId} instance={instance} series={live} />
            ) : null}
            onCollapse={expansion?.collapse}
        >
            <div className={styles.progressChartHeader}>{heading}</div>
            <div className={styles.chartFade} data-visible={visible}>
                <ProgressChartView rootId={rootId} series={data} density="compact" hoverInstanceId={hoverInstanceId} />
            </div>
        </ExpandableChartFrame>
    );
}
