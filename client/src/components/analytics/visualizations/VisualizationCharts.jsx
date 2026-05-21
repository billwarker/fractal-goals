import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

import ActivityHeatmap from '../ActivityHeatmap';
import {
    ActivityGroupMixChart,
    ActivityMetricVolumeChart,
    ActivityPersonalBestTrend,
    ActivityTimeByActivity,
    GoalAgingChart,
    GoalCompletionRateByLevel,
    GoalMomentumChart,
    SessionCompletionRateChart,
    SessionConsistencyChart,
    SessionDurationHistogram,
    SessionDurationTrend,
    SessionPlannedVsActualChart,
    SessionSectionPie,
    SessionStartDistribution,
    StaleGoalsChart,
} from '../AnalyticsExtraCharts';
import { DISABLED_CHART_ANIMATION } from '../ChartJSWrapper';
import GoalCompletionTimeline from '../GoalCompletionTimeline';
import GoalTimeDistribution from '../GoalTimeDistribution';
import LineGraph from '../LineGraph';
import ScatterPlot from '../ScatterPlot';
import StreakTimeline from '../StreakTimeline';
import WeeklyBarChart from '../WeeklyBarChart';
import { ActivityTotalsChart } from './activities/ActivityTotals';
import styles from '../ProfileWindow.module.css';
import { Heading } from '../../atoms/Typography';

function StatCard({ value, label, subLabel, color }) {
    return (
        <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color }}>
                {value}
            </div>
            <div>
                <div className={styles.statLabel}>{label}</div>
                {subLabel && <div className={styles.statSubLabel}>{subLabel}</div>}
            </div>
        </div>
    );
}

function getActivityChartData(goal) {
    if (!goal?.activity_breakdown?.length) {
        return { labels: [], datasets: [] };
    }
    const sortedActivities = [...goal.activity_breakdown].sort((a, b) => b.instance_count - a.instance_count);
    return {
        labels: sortedActivities.map((activity) => activity.activity_name),
        datasets: [{
            label: 'Instances',
            data: sortedActivities.map((activity) => activity.instance_count),
            backgroundColor: '#2196f3',
            borderColor: '#1976d2',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };
}

function getDurationChartData(goal) {
    if (!goal?.session_durations_by_date?.length) {
        return { labels: [], datasets: [] };
    }
    return {
        labels: goal.session_durations_by_date.map((session) => new Date(session.date)),
        datasets: [{
            label: 'Duration (minutes)',
            data: goal.session_durations_by_date.map((session) => Math.round(session.duration_seconds / 60)),
            borderColor: '#4caf50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
        }],
    };
}

const activityChartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    ...DISABLED_CHART_ANIMATION,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            titleColor: '#fff',
            bodyColor: '#ccc',
            padding: 12,
            callbacks: {
                label: (ctx) => `${ctx.raw} instance${ctx.raw !== 1 ? 's' : ''}`,
            },
        },
    },
    scales: {
        x: {
            beginAtZero: true,
            ticks: { color: '#888', stepSize: 1 },
            grid: { color: '#333' },
        },
        y: {
            ticks: { color: '#ccc', font: { size: 11 } },
            grid: { display: false },
        },
    },
};

const durationChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    ...DISABLED_CHART_ANIMATION,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            titleColor: '#fff',
            bodyColor: '#ccc',
            padding: 12,
            callbacks: {
                title: (ctx) => {
                    const date = new Date(ctx[0].label);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                },
                label: (ctx) => {
                    const minutes = ctx.raw;
                    if (minutes >= 60) {
                        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                    }
                    return `${minutes}m`;
                },
            },
        },
    },
    scales: {
        x: {
            type: 'time',
            time: { unit: 'day', displayFormats: { day: 'MMM d' } },
            ticks: { color: '#888' },
            grid: { color: '#333' },
        },
        y: {
            beginAtZero: true,
            title: { display: true, text: 'Duration (min)', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: '#333' },
        },
    },
};

export function GoalSummaryChart({ context }) {
    const { scopedData, data } = context;
    const summary = scopedData.goalSummary;
    return (
        <div className={styles.vizContainer}>
            <Heading level={3} className={styles.vizTitle}>Goal Summary</Heading>
            <div className={styles.statsGrid}>
                <StatCard value={summary.completed_goals || 0} label="Completed" subLabel={`${summary.completion_rate?.toFixed(1) || 0}% rate`} color="#4caf50" />
                <StatCard value={`${summary.avg_goal_age_days || 0}d`} label="Avg Age" subLabel="Days old" color="#2196f3" />
                <StatCard value={`${summary.avg_time_to_completion_days || 0}d`} label="Avg to Complete" subLabel="Days" color="#ff9800" />
                <StatCard value={data.formatDuration(summary.avg_duration_to_completion_seconds || 0)} label="Avg Time" subLabel="Per goal" color="#9c27b0" />
            </div>
        </div>
    );
}

export function GoalCompletionTimelineChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionTimeline goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

export function GoalTimeDistributionChart({ context }) {
    const state = context.visualizationState;
    return (
        <div className={styles.vizContainerHidden}>
            <GoalTimeDistribution
                goals={context.scopedData.goals}
                chartRef={context.chartRef}
                durationMode={state.durationMode || 'activity'}
                inheritanceMode={state.inheritanceMode || 'direct'}
            />
        </div>
    );
}

export function GoalCompletionRateByLevelChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionRateByLevel goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

export function GoalAgingVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalAgingChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

export function GoalMomentumVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalMomentumChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

export function StaleGoalsVisualizationChart({ context }) {
    return <div className={styles.vizContainer}><StaleGoalsChart goals={context.scopedData.goals} /></div>;
}

export function GoalDetailChart({ context }) {
    const { effectiveSelectedGoal, getGoalTypeColor } = context;
    const selectedChart = context.visualizationState.chart || 'duration';
    if (!effectiveSelectedGoal) {
        return <div className={styles.emptyState}>Select a goal above to view details</div>;
    }
    return (
        <div className={styles.vizContainer}>
            <div className={styles.goalHeader}>
                <Heading level={3} className={styles.goalTitle}>{effectiveSelectedGoal.name}</Heading>
                <span className={styles.goalBadge} style={{ background: getGoalTypeColor(effectiveSelectedGoal.type) }}>
                    {effectiveSelectedGoal.type.replace('Goal', '')}
                </span>
            </div>
            <div className={styles.statsGrid}>
                <StatCard value={context.data.formatDuration(effectiveSelectedGoal.total_duration_seconds || 0)} label="Total Time" subLabel="Selected range" color="#2196f3" />
                <StatCard value={effectiveSelectedGoal.session_count || 0} label="Sessions" subLabel="Selected range" color="#4caf50" />
                <StatCard value={`${effectiveSelectedGoal.age_days || 0}d`} label="Goal Age" color="#ff9800" />
            </div>
            <div className={styles.chartContainer}>
                {selectedChart === 'duration' ? (
                    effectiveSelectedGoal.session_durations_by_date?.length > 0
                        ? <Line data={getDurationChartData(effectiveSelectedGoal)} options={durationChartOptions} />
                        : <div className={styles.noData}>No session data available</div>
                ) : (
                    effectiveSelectedGoal.activity_breakdown?.length > 0
                        ? <Bar data={getActivityChartData(effectiveSelectedGoal)} options={activityChartOptions} />
                        : <div className={styles.noData}>No activities recorded</div>
                )}
            </div>
        </div>
    );
}

export function SessionSummaryChart({ context }) {
    const { sessions } = context.scopedData;
    const completedSessions = sessions.filter((session) => session.completed);
    const totalDuration = sessions.reduce((sum, session) => sum + (session.total_duration_seconds || 0), 0);
    const avgDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;
    return (
        <div className={styles.vizContainer}>
            <Heading level={3} className={styles.vizTitle}>Session Summary</Heading>
            <div className={styles.statsGrid}>
                <StatCard value={sessions.length} label="Total Sessions" subLabel="Selected range" color="#2196f3" />
                <StatCard value={completedSessions.length} label="Completed" subLabel={`${sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0}% rate`} color="#4caf50" />
                <StatCard value={context.data.formatDuration(totalDuration)} label="Total Time" subLabel="Practiced" color="#ff9800" />
                <StatCard value={context.data.formatDuration(avgDuration)} label="Avg Duration" subLabel="Per session" color="#9c27b0" />
            </div>
        </div>
    );
}

export function SessionHeatmapChart({ context }) {
    return <div className={styles.vizContainerHeatmap}><ActivityHeatmap sessions={context.scopedData.sessions} months={context.visualizationState.months || 12} /></div>;
}

export function SessionStreaksChart({ context }) {
    return <div className={styles.vizContainerHidden}><StreakTimeline sessions={context.scopedData.sessions} /></div>;
}

export function SessionWeeklyChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <WeeklyBarChart
                sessions={context.scopedData.sessions}
                weeks={12}
                chartRef={context.chartRef}
                selectedDateRange={context.dateRange}
                onDateRangeChange={context.onGlobalDateRangeChange}
                showMetricSelectors={false}
            />
        </div>
    );
}

export function SessionDurationTrendChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionDurationTrend sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function SessionSectionPieChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionSectionPie sessions={context.scopedData.sessions} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

export function SessionCompletionRateVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionCompletionRateChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function SessionStartDistributionChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionStartDistribution sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function SessionDurationHistogramChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionDurationHistogram sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function SessionPlannedVsActualVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionPlannedVsActualChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function SessionConsistencyVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionConsistencyChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function ActivityScatterPlotChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return (
        <div className={styles.vizContainerHidden}>
            <ScatterPlot
                selectedActivity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                activities={context.scopedData.activities}
                setsHandling={context.visualizationState.setsHandling || 'top'}
                selectedSplit={context.visualizationState.selectedSplit || 'all'}
                chartRef={context.chartRef}
                selectedMetricX={context.visualizationState.metricX}
                selectedMetricY={context.visualizationState.metricY}
            />
        </div>
    );
}

export function ActivityLineGraphChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return (
        <div className={styles.vizContainerHidden}>
            <LineGraph
                selectedActivity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                activities={context.scopedData.activities}
                selectedMetric={context.visualizationState.metric}
                setSelectedMetric={(metric) => context.updateVisualizationState({ metric })}
                selectedMetricY2={context.visualizationState.metricY2}
                setSelectedMetricY2={(metricY2) => context.updateVisualizationState({ metricY2 })}
                setsHandling={context.visualizationState.setsHandling || 'top'}
                selectedSplit={context.visualizationState.selectedSplit || 'all'}
                chartRef={context.chartRef}
                selectedDateRange={context.dateRange}
                onDateRangeChange={context.onGlobalDateRangeChange}
                showMetricSelectors={false}
            />
        </div>
    );
}

export function ActivityTotalsVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <ActivityTotalsChart
                activities={context.scopedData.activities}
                activityInstances={context.scopedData.activityInstances}
                chartRef={context.chartRef}
                metric={context.visualizationState.metric || 'instances'}
                activityGroups={context.data.activityGroups}
                showGroupNames={Boolean(context.visualizationState.showGroups)}
                limit={context.visualizationState.limit || 15}
            />
        </div>
    );
}

export function ActivityTimeByActivityChart({ context }) {
    return <div className={styles.vizContainerHidden}><ActivityTimeByActivity activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

export function ActivityPersonalBestChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return <div className={styles.vizContainerHidden}><ActivityPersonalBestTrend selectedActivity={context.effectiveSelectedActivity} activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

export function ActivityMetricVolumeVisualizationChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return <div className={styles.vizContainerHidden}><ActivityMetricVolumeChart selectedActivity={context.effectiveSelectedActivity} activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

export function ActivityGroupMixVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><ActivityGroupMixChart activities={context.scopedData.activities} activityGroups={context.data.activityGroups} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}
