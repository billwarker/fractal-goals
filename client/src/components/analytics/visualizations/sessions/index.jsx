import React from 'react';

import lazyChart from '../../lazyChart';
import StreakTimeline from '../../StreakTimeline';
import { Heading } from '../../../atoms/Typography';
import EmptyControls from '../shared/EmptyControls';
import useGroupLookups from '../shared/useGroupLookups';
import StatCard from '../shared/StatCard';
import ChartNumberField from '../shared/ChartNumberField';
import { SESSION_TREND_GROUPS, SessionTrendsChart, SessionTrendsControls, sessionTrendMeasure } from './SessionTrends';
import styles from '../../ProfileWindow.module.css';

const SessionDurationHistogram = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.SessionDurationHistogram })));
const SessionSectionPie = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.SessionSectionPie })));
const SessionStartDistribution = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.SessionStartDistribution })));


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

function SessionStreaksChart({ context }) {
    return <div className={styles.vizContainerHidden}><StreakTimeline sessions={context.scopedData.sessions} dateRange={context.dateRange} /></div>;
}

function SessionTrendsVisualizationChart({ context }) {
    const { groupBy } = useGroupLookups(context, SESSION_TREND_GROUPS);
    return (
        <div className={styles.vizContainerHidden}>
            <SessionTrendsChart
                sessions={context.scopedData.sessions}
                chartRef={context.chartRef}
                // Saved views from before calendar grains may hold "year"; those read as automatic.
                grain={['day', 'week', 'month'].includes(context.visualizationState.grain) ? context.visualizationState.grain : 'auto'}
                measure={sessionTrendMeasure(context.visualizationState)}
                range={context.dateRange}
                groupBy={groupBy}
            />
        </div>
    );
}

function SessionSectionPieVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><SessionSectionPie sessions={context.scopedData.sessions} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function SessionStartDistributionVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <SessionStartDistribution
                sessions={context.scopedData.sessions}
                chartRef={context.chartRef}
                markers={context.visualizationState.markers || ['start']}
            />
        </div>
    );
}

function SessionDurationHistogramVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <SessionDurationHistogram
                sessions={context.scopedData.sessions}
                chartRef={context.chartRef}
                bucketCount={context.visualizationState.bucketCount || 5}
            />
        </div>
    );
}

export function SessionTimeDistributionControls({ context }) {
    const selectedMarkers = context.visualizationState.markers?.length
        ? context.visualizationState.markers
        : ['start'];
    const toggleMarker = (marker) => {
        const nextMarkers = selectedMarkers.includes(marker)
            ? selectedMarkers.filter((value) => value !== marker)
            : [...selectedMarkers, marker];
        context.updateVisualizationState({ markers: nextMarkers.length ? nextMarkers : selectedMarkers });
    };

    return (
        <div className="sessions-query-chip-group">
            {[
                { value: 'start', label: 'Session Start' },
                { value: 'end', label: 'Session End' },
            ].map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`sessions-query-chip ${selectedMarkers.includes(option.value) ? 'active' : ''}`}
                    onClick={() => toggleMarker(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function DurationHistogramControls({ context }) {
    return (
        <ChartNumberField
            label="Buckets"
            value={context.visualizationState.bucketCount || 5}
            defaultValue={5}
            min={1}
            max={30}
            onChange={(bucketCount) => context.updateVisualizationState({ bucketCount })}
        />
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
        id: 'sessionTrends',
        category: 'sessions',
        name: 'Session Trends',
        iconType: 'sessions:sessionTrends',
        // No default measure, so a saved view's older `metrics` list still decides it.
        defaultState: { grain: 'auto' },
        selectionRequirements: {},
        Chart: SessionTrendsVisualizationChart,
        Controls: SessionTrendsControls,
        groupByDimensions: SESSION_TREND_GROUPS,
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
        id: 'startDistribution',
        category: 'sessions',
        name: 'Start and End Times',
        iconType: 'sessions:startDistribution',
        defaultState: { markers: ['start'] },
        selectionRequirements: {},
        Chart: SessionStartDistributionVisualizationChart,
        Controls: SessionTimeDistributionControls,
    },
    {
        id: 'durationHistogram',
        category: 'sessions',
        name: 'Duration Histogram',
        iconType: 'sessions:durationHistogram',
        defaultState: { bucketCount: 5 },
        selectionRequirements: {},
        Chart: SessionDurationHistogramVisualizationChart,
        Controls: DurationHistogramControls,
    },
];
