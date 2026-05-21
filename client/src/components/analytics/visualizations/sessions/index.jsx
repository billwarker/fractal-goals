import React from 'react';

import ActivityHeatmap from '../../ActivityHeatmap';
import {
    SessionCompletionRateChart,
    SessionConsistencyChart,
    SessionDurationHistogram,
    SessionDurationTrend,
    SessionPlannedVsActualChart,
    SessionSectionPie,
    SessionStartDistribution,
} from '../../AnalyticsExtraCharts';
import StreakTimeline from '../../StreakTimeline';
import WeeklyBarChart from '../../WeeklyBarChart';
import styles from '../../ProfileWindow.module.css';
import { Heading } from '../../../atoms/Typography';
import EmptyControls from '../shared/EmptyControls';
import StatCard from '../shared/StatCard';

function SessionSummaryChart({ context }) {
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

function SessionHeatmapChart({ context }) {
    return <div className={styles.vizContainerHeatmap}><ActivityHeatmap sessions={context.scopedData.sessions} months={context.visualizationState.months || 12} /></div>;
}

function SessionStreaksChart({ context }) {
    return <div className={styles.vizContainerHidden}><StreakTimeline sessions={context.scopedData.sessions} /></div>;
}

function SessionWeeklyChart({ context }) {
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

function SessionDurationTrendVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionDurationTrend sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

function SessionSectionPieVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionSectionPie sessions={context.scopedData.sessions} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function SessionCompletionRateVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionCompletionRateChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

function SessionStartDistributionVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionStartDistribution sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

function SessionDurationHistogramVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionDurationHistogram sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

function SessionPlannedVsActualVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionPlannedVsActualChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

function SessionConsistencyVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionConsistencyChart sessions={context.scopedData.sessions} chartRef={context.chartRef} /></div>;
}

export function HeatmapControls({ context }) {
    return (
        <div className="sessions-query-chip-group">
            {[
                { value: 12, label: '1 Year' },
                { value: 6, label: '6 Months' },
                { value: 3, label: '3 Months' },
                { value: 1, label: '1 Month' },
            ].map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`sessions-query-chip ${(context.visualizationState.months || 12) === option.value ? 'active' : ''}`}
                    onClick={() => context.updateVisualizationState({ months: option.value })}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export const SESSION_VISUALIZATIONS = [
    {
        id: 'stats',
        category: 'sessions',
        name: 'Summary Stats',
        iconType: 'sessions:stats',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionSummaryChart,
        Controls: EmptyControls,
    },
    {
        id: 'durationTrend',
        category: 'sessions',
        name: 'Duration Trend',
        iconType: 'sessions:durationTrend',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionDurationTrendVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'sectionPie',
        category: 'sessions',
        name: 'Section Time',
        iconType: 'sessions:sectionPie',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionSectionPieVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'heatmap',
        category: 'sessions',
        name: 'Activity Heatmap',
        iconType: 'sessions:heatmap',
        defaultState: { months: 12 },
        selectionRequirements: {},
        Chart: SessionHeatmapChart,
        Controls: HeatmapControls,
    },
    {
        id: 'streaks',
        category: 'sessions',
        name: 'Streak Timeline',
        iconType: 'sessions:streaks',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionStreaksChart,
        Controls: EmptyControls,
    },
    {
        id: 'weeklyChart',
        category: 'sessions',
        name: 'Weekly Chart',
        iconType: 'sessions:weeklyChart',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionWeeklyChart,
        Controls: EmptyControls,
    },
    {
        id: 'completionRate',
        category: 'sessions',
        name: 'Completion Rate',
        iconType: 'sessions:completionRate',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionCompletionRateVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'startDistribution',
        category: 'sessions',
        name: 'Start Times',
        iconType: 'sessions:startDistribution',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionStartDistributionVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'durationHistogram',
        category: 'sessions',
        name: 'Duration Histogram',
        iconType: 'sessions:durationHistogram',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionDurationHistogramVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'plannedVsActual',
        category: 'sessions',
        name: 'Planned vs Actual',
        iconType: 'sessions:plannedVsActual',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionPlannedVsActualVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'consistency',
        category: 'sessions',
        name: 'Consistency',
        iconType: 'sessions:consistency',
        defaultState: {},
        selectionRequirements: {},
        Chart: SessionConsistencyVisualizationChart,
        Controls: EmptyControls,
    },
];
