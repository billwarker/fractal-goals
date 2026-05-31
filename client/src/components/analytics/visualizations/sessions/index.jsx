import React from 'react';

import {
    SessionDurationHistogram,
    SessionSectionPie,
    SessionStartDistribution,
} from '../../AnalyticsExtraCharts';
import StreakTimeline from '../../StreakTimeline';
import styles from '../../ProfileWindow.module.css';
import { Heading } from '../../../atoms/Typography';
import EmptyControls from '../shared/EmptyControls';
import StatCard from '../shared/StatCard';
import { SessionTrendsChart, SessionTrendsControls } from './SessionTrends';

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
    return (
        <div className={styles.vizContainerHidden}>
            <SessionTrendsChart
                sessions={context.scopedData.sessions}
                chartRef={context.chartRef}
                grain={context.visualizationState.grain || 'week'}
                metrics={context.visualizationState.metrics || ['sessions', 'duration']}
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
    const bucketCount = context.visualizationState.bucketCount || 5;
    const handleBucketChange = (event) => {
        const rawValue = event.target.value;
        if (rawValue === '') {
            context.updateVisualizationState({ bucketCount: '' });
            return;
        }

        const nextValue = Math.max(1, Math.min(30, Number(rawValue) || 5));
        context.updateVisualizationState({ bucketCount: nextValue });
    };

    return (
        <label className="sessions-query-field">
            <span>Buckets</span>
            <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={bucketCount}
                onChange={handleBucketChange}
            />
        </label>
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
        defaultState: { grain: 'week', metrics: ['sessions', 'duration'] },
        selectionRequirements: {},
        Chart: SessionTrendsVisualizationChart,
        Controls: SessionTrendsControls,
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
