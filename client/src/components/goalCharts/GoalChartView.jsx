import React, { useEffect, useMemo, useRef } from 'react';

import ChartGoalSurface, { PresetSurfaceChart } from '../analytics/ChartGoalSurface';
import { ChartDensityContext } from '../analytics/ChartJSWrapper';
import { activityChartToSave, conditionGoalChart } from '../analytics/chartGoalTargets';
import SavedViewChart from '../analytics/SavedViewChart';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import { useGoalConditionEvidence } from '../../hooks/useGoalConditionQueries';
import { buildAnalyticsLink } from '../../utils/analyticsDeepLink';
import styles from './GoalCharts.module.css';

/** The threshold chart, from the goal's evidence in its active period. */
function GoalConditionChart({ rootId, goalId, density, goalSurface = null }) {
    const chartRef = useRef(null);
    const query = useGoalConditionEvidence(rootId, goalId, { since: 'active' });
    const payload = query.data;
    const activity = payload?.activity_definition || null;
    const instances = payload?.instances;
    const goalChart = useMemo(
        () => (goalSurface && activity ? conditionGoalChart(payload?.condition) : null),
        [activity, goalSurface, payload?.condition],
    );
    const activityInstances = useMemo(
        () => (activity ? { [activity.id]: instances || [] } : {}),
        [activity, instances],
    );
    const onChartInfo = goalSurface?.onChartInfo;
    useEffect(() => {
        onChartInfo?.({
            canSetGoal: Boolean(goalChart),
            analyticsHref: goalChart ? buildAnalyticsLink(rootId, {
                activityId: activity.id, metricIds: goalChart.metrics, setsHandling: goalChart.setsHandling,
            }) : null,
        });
    }, [activity, goalChart, onChartInfo, rootId]);
    if (query.isLoading) return <div className={styles.status} role="status">Loading chart…</div>;
    if (query.error) {
        return (
            <div className={styles.status} role="alert">
                This chart couldn’t load. <button type="button" className={styles.retry} onClick={() => query.refetch()}>Retry</button>
            </div>
        );
    }
    if (!payload?.condition) return <div className={styles.status}>This goal has no threshold to chart.</div>;
    const chartProps = { condition: payload.condition, instances: instances || [], activity, density };
    if (!goalChart) return <ConditionProgressChart {...chartProps} />;
    return (
        <ChartDensityContext.Provider value={density}>
            <ChartGoalSurface
                Chart={PresetSurfaceChart}
                rootId={rootId}
                annotating={goalSurface.annotating}
                onAnnotatingChange={goalSurface.onAnnotatingChange}
                currentGoalId={goalId}
                chartToSave={activityChartToSave(goalChart, null, activity)}
                context={{
                    visualization: { id: goalChart.id },
                    chartRef,
                    effectiveSelectedActivity: activity,
                    scopedData: { activities: [activity], activityInstances },
                    visualizationState: { setsHandling: goalChart.setsHandling },
                    globalFilters: null,
                    presetChart: { Chart: ConditionProgressChart, props: { ...chartProps, goalId } },
                }}
            />
        </ChartDensityContext.Provider>
    );
}

/** One of a goal's charts: the default threshold chart or an attached saved view. */
export default function GoalChartView({ rootId, goalId, item, density, goalSurface = null }) {
    if (!item) return null;
    if (item.kind === 'default') return <GoalConditionChart rootId={rootId} goalId={goalId} density={density} goalSurface={goalSurface} />;
    return (
        <SavedViewChart
            rootId={rootId}
            layout={item.layout}
            density={density}
            goalSurface={goalSurface ? { ...goalSurface, viewId: item.dashboardId, currentGoalId: goalId } : null}
        />
    );
}
