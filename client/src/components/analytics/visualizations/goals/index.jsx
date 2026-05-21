import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

import {
    GoalAgingChart,
    GoalCompletionRateByLevel,
    GoalMomentumChart,
    StaleGoalsChart,
} from '../../AnalyticsExtraCharts';
import { DISABLED_CHART_ANIMATION } from '../../ChartJSWrapper';
import GoalCompletionTimeline from '../../GoalCompletionTimeline';
import GoalTimeDistribution from '../../GoalTimeDistribution';
import styles from '../../ProfileWindow.module.css';
import { Heading } from '../../../atoms/Typography';
import EmptyControls from '../shared/EmptyControls';
import StatCard from '../shared/StatCard';

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

function GoalSummaryChart({ context }) {
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

function GoalCompletionTimelineChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionTimeline goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalTimeDistributionChart({ context }) {
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

function GoalCompletionRateByLevelChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionRateByLevel goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalAgingVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalAgingChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalMomentumVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalMomentumChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function StaleGoalsVisualizationChart({ context }) {
    return <div className={styles.vizContainer}><StaleGoalsChart goals={context.scopedData.goals} /></div>;
}

function GoalDetailChart({ context }) {
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

export function GoalDetailControls({ context }) {
    return (
        <>
            <button
                type="button"
                className="sessions-query-picker-button"
                onClick={context.onOpenGoalModal}
                disabled={context.profileGoals.length === 0}
            >
                {context.selectedGoalDef ? context.selectedGoalDef.name : 'Choose Goal'}
            </button>
            {context.selectedGoalDef && (
                <div className="sessions-query-chip-group" style={{ marginTop: 10 }}>
                    {[
                        { value: 'duration', label: 'Duration' },
                        { value: 'activity', label: 'Activities' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`sessions-query-chip ${(context.visualizationState.chart || 'duration') === option.value ? 'active' : ''}`}
                            onClick={() => context.updateVisualizationState({ chart: option.value })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

export function GoalTimeDistributionControls({ context }) {
    return (
        <>
            <div className="sessions-query-chip-group">
                {[
                    { value: 'activity', label: 'Activities' },
                    { value: 'session', label: 'Sessions' },
                ].map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${(context.visualizationState.durationMode || 'activity') === option.value ? 'active' : ''}`}
                        onClick={() => context.updateVisualizationState({ durationMode: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <label className="sessions-query-field" style={{ marginTop: 12 }}>
                <span>Inheritance</span>
                <select
                    value={context.visualizationState.inheritanceMode || 'direct'}
                    onChange={(event) => context.updateVisualizationState({ inheritanceMode: event.target.value })}
                >
                    <option value="direct">Direct only</option>
                    <option value="descendants">Include descendants</option>
                    <option value="root">Roll up to root</option>
                </select>
            </label>
        </>
    );
}

export const GOAL_VISUALIZATIONS = [
    {
        id: 'stats',
        category: 'goals',
        name: 'Summary Stats',
        iconType: 'goals:stats',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalSummaryChart,
        Controls: EmptyControls,
    },
    {
        id: 'completionTimeline',
        category: 'goals',
        name: 'Completion Timeline',
        iconType: 'goals:completionTimeline',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalCompletionTimelineChart,
        Controls: EmptyControls,
    },
    {
        id: 'timeDistribution',
        category: 'goals',
        name: 'Time Spent Per Goal',
        iconType: 'goals:timeDistribution',
        defaultState: { durationMode: 'activity', inheritanceMode: 'direct' },
        selectionRequirements: {},
        Chart: GoalTimeDistributionChart,
        Controls: GoalTimeDistributionControls,
    },
    {
        id: 'completionRateByLevel',
        category: 'goals',
        name: 'Completion Rate',
        iconType: 'goals:completionRateByLevel',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalCompletionRateByLevelChart,
        Controls: EmptyControls,
    },
    {
        id: 'goalAging',
        category: 'goals',
        name: 'Goal Aging',
        iconType: 'goals:goalAging',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalAgingVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'goalMomentum',
        category: 'goals',
        name: 'Goal Momentum',
        iconType: 'goals:goalMomentum',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalMomentumVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'staleGoals',
        category: 'goals',
        name: 'Stale Goals',
        iconType: 'goals:staleGoals',
        defaultState: {},
        selectionRequirements: {},
        Chart: StaleGoalsVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'goalDetail',
        category: 'goals',
        name: 'Goal Detail View',
        iconType: 'goals:goalDetail',
        defaultState: { chart: 'duration' },
        selectionRequirements: { goal: true },
        Chart: GoalDetailChart,
        Controls: GoalDetailControls,
    },
];
