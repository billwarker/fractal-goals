import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useActivityProgressSeries } from '../../hooks/useActivityTags';
import { buildAnalyticsLink } from '../../utils/analyticsDeepLink';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import styles from './ProgressPanel.module.css';

/** The metrics an Analytics trend chart should plot for this chart's condition. */
function chartMetricIds(chart, activity) {
    const condition = chart?.condition;
    if (!condition) return [];
    if (condition.measure === 'yield') return (activity?.yield_metric_ids || []).slice(0, 2);
    if (condition.measure === 'sets') return (condition.rules || []).slice(0, 2).map((rule) => rule.metric_definition_id);
    return condition.metric_definition_id ? [condition.metric_definition_id] : [];
}

/**
 * A compact chart of the sessions this instance compares against, ending with this session:
 * the in-scope goal condition when there is one, else the activity's headline metric.
 */
export default function ProgressChart({ rootId, activityId, instance, choice }) {
    const navigate = useNavigate();
    const { data, isLoading } = useActivityProgressSeries(rootId, activityId, { instanceId: instance.id, preview: choice });
    if (isLoading || !data?.chart?.condition) return null;
    const { chart, activity_definition: activity } = data;
    const context = instance.comparison_context || {};
    const analyticsHref = buildAnalyticsLink(rootId, {
        activityId,
        metricIds: chartMetricIds(chart, activity),
        tagIds: choice.mode === 'all' ? null : choice.tagIds,
        tagMatch: 'exact',
        templateId: choice.sameTemplate ? context.template?.id : null,
        programDayId: choice.sameProgramDay ? context.program_day?.id : null,
    });
    const heading = chart.source === 'goal_condition' ? `Goal: ${chart.goal_name}` : 'This activity over time';
    // Like the goal charts: the whole card is the link; the mini chart is a preview without tooltips.
    const openInAnalytics = () => navigate(analyticsHref);
    return (
        <section
            className={styles.progressChart}
            role="link"
            tabIndex={0}
            aria-label={`${heading}. Open in Analytics`}
            title="Open in Analytics"
            data-href={analyticsHref}
            onClick={openInAnalytics}
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget || event.key !== 'Enter') return;
                event.preventDefault();
                openInAnalytics();
            }}
        >
            <div className={styles.progressChartHeader}>
                <span>{heading}</span>
                <svg className={styles.progressChartExpand} viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M9 2h5v5M14 2 8 8M7 3H3v10h10V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
            <ConditionProgressChart
                condition={chart.condition}
                instances={data.instances}
                activity={activity}
                density="compact"
                highlightInstanceId={data.current_instance_id}
            />
        </section>
    );
}
