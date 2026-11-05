import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Link } from 'react-router-dom';

import { goalDeepLink } from '../../utils/goalDeepLink';
import { formatDuration } from '../../utils/chartFormat';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from './ChartJSWrapper';
import { ChartEmpty } from './ChartStates';
import SeriesDoughnut from './series/SeriesDoughnut';
import { BAR_MARKS, HISTOGRAM_BAR_MARKS, ROW_BAR_MARKS } from './visualizations/shared/barMarks';
import styles from './AnalyticsExtraCharts.module.css';

const DEFAULT_TIME_MARKERS = ['start'];
const STALE_AFTER_DAYS = 14;
const STALE_LIMIT = 10;

function getSessionDate(session) {
    const value = session?.session_start || session?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * Bar chart options shared by these charts. The panel header names the chart, so there's no title
 * inside it; a single series needs no legend; values read through `formatValue`.
 */
function barOptions(chartTheme, { valueTitle, formatValue = null, tickFormat = undefined, horizontal = false, legend = false }) {
    const valueAxis = horizontal ? 'x' : 'y';
    const categoryAxis = horizontal ? 'y' : 'x';
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        ...DISABLED_CHART_ANIMATION,
        plugins: {
            legend: {
                display: legend,
                position: 'top',
                labels: { color: chartTheme.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                padding: 12,
                ...(formatValue ? { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatValue(ctx.raw)}` } } : {}),
            },
        },
        scales: {
            [categoryAxis]: { ticks: { color: chartTheme.textColor }, grid: { display: false } },
            [valueAxis]: {
                beginAtZero: true,
                title: { display: Boolean(valueTitle), text: valueTitle, color: chartTheme.textColor },
                ticks: { color: chartTheme.textColor, ...(tickFormat ? { callback: tickFormat } : { precision: 0 }) },
                grid: { color: chartTheme.gridColor },
            },
        },
    };
}

const barMarks = (color, marks = BAR_MARKS) => ({ backgroundColor: color, ...marks });

export function SessionSectionPie({ sessions = [], activityInstances = {}, chartRef }) {
    const rows = useMemo(() => {
        const instanceDurations = new Map();
        Object.values(activityInstances).flat().forEach((instance) => {
            instanceDurations.set(instance.id, instance.duration_seconds || 0);
        });
        const totals = new Map();
        sessions.forEach((session) => {
            (session.sections || []).forEach((section) => {
                const sectionName = section.name || 'Unnamed section';
                const total = (section.activity_ids || []).reduce((sum, id) => sum + (instanceDurations.get(id) || 0), 0);
                if (total > 0) totals.set(sectionName, (totals.get(sectionName) || 0) + total);
            });
        });
        return [...totals.entries()].map(([label, value]) => ({ key: label, label, value }));
    }, [activityInstances, sessions]);
    return (
        <SeriesDoughnut
            rows={rows}
            chartRef={chartRef}
            formatValue={formatDuration}
            title="Time by session section"
            emptyDescription="Section time appears after activities have tracked time inside session sections."
        />
    );
}

export function GoalCompletionRateByLevel({ goals = [], chartRef }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const rows = useMemo(() => {
        const counts = new Map();
        [...goals]
            .sort((left, right) => (left.level_rank ?? 99) - (right.level_rank ?? 99))
            .forEach((goal) => {
                const key = goal.level_name || (goal.type || 'Goal').replace('Goal', '') || 'Goal';
                const current = counts.get(key) || { total: 0, completed: 0 };
                current.total += 1;
                if (goal.completed) current.completed += 1;
                counts.set(key, current);
            });
        return [...counts.entries()].map(([label, value]) => ({ label, ...value, rate: Math.round((value.completed / value.total) * 100) }));
    }, [goals]);
    if (!rows.length) return <ChartEmpty description="Completion rates appear once goals exist in this scope." />;
    const options = barOptions(chartTheme, { valueTitle: 'Completed', tickFormat: (value) => `${value}%` });
    options.scales.y.max = 100;
    options.plugins.tooltip.callbacks = {
        label: (ctx) => `${rows[ctx.dataIndex].rate}% (${rows[ctx.dataIndex].completed} of ${rows[ctx.dataIndex].total})`,
    };
    return (
        <Bar
            ref={chartRef}
            data={{ labels: rows.map((row) => row.label), datasets: [{ label: 'Completion rate', data: rows.map((row) => row.rate), ...barMarks(chartTheme.seriesColors[0]) }] }}
            options={applyChartDensity(options, density)}
        />
    );
}

export function GoalAgingChart({ goals = [], chartRef }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const active = useMemo(() => goals.filter((goal) => !goal.completed), [goals]);
    const counts = useMemo(() => {
        const buckets = [['0–7 days', 0], ['8–30 days', 0], ['31–90 days', 0], ['90+ days', 0]];
        active.forEach((goal) => {
            const age = goal.age_days || 0;
            const index = age <= 7 ? 0 : age <= 30 ? 1 : age <= 90 ? 2 : 3;
            buckets[index][1] += 1;
        });
        return buckets;
    }, [active]);
    if (!active.length) return <ChartEmpty description="Goal ages appear once there are active goals in this scope." />;
    return (
        <Bar
            ref={chartRef}
            data={{ labels: counts.map(([label]) => label), datasets: [{ label: 'Active goals', data: counts.map(([, count]) => count), ...barMarks(chartTheme.seriesColors[0]) }] }}
            options={applyChartDensity(barOptions(chartTheme, { valueTitle: 'Active goals' }), density)}
        />
    );
}

export function GoalMomentumChart({ goals = [], chartRef }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const rows = useMemo(() => goals
        .map((goal) => ({ label: goal.name, seconds: goal.activity_duration_seconds ?? (goal.activity_durations_by_date || []).reduce((sum, item) => sum + (item.duration_seconds || 0), 0) }))
        .filter((row) => row.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 12), [goals]);
    if (!rows.length) return <ChartEmpty description="Goal momentum appears once activities on goals have tracked time." />;
    return (
        <Bar
            ref={chartRef}
            data={{ labels: rows.map((row) => row.label), datasets: [{ label: 'Activity time', data: rows.map((row) => row.seconds / 3600), ...barMarks(chartTheme.seriesColors[0], ROW_BAR_MARKS) }] }}
            options={applyChartDensity(barOptions(chartTheme, {
                horizontal: true, valueTitle: 'Hours', tickFormat: (value) => `${value}h`, formatValue: (hours) => formatDuration(hours * 3600),
            }), density)}
        />
    );
}

export function staleGoalRows(goals = [], now = new Date()) {
    return goals
        .filter((goal) => !goal.completed)
        .map((goal) => {
            const dates = [
                ...(goal.activity_durations_by_date || []).map((item) => item.date),
                ...(goal.session_durations_by_date || []).map((item) => item.date),
                goal.last_evidence_at,
                goal.created_at,
            ].filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
            const last = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
            return { goal, last, days: last ? Math.floor((now - last) / 86400000) : 0 };
        })
        .filter((row) => row.days >= STALE_AFTER_DAYS)
        .sort((a, b) => b.days - a.days)
        .slice(0, STALE_LIMIT);
}

/** Active goals with no evidence for two weeks or more, longest first; a row opens the goal. */
export function StaleGoalsChart({ goals = [], rootId = null, getGoalColor = null }) {
    const stale = useMemo(() => staleGoalRows(goals), [goals]);
    if (!stale.length) {
        return <ChartEmpty title="No stale goals" description={`Every active goal has had activity in the last ${STALE_AFTER_DAYS} days.`} />;
    }
    return (
        <>
            <p className={styles.staleIntro}>Active goals with no activity for {STALE_AFTER_DAYS} days or more.</p>
            <ol className={styles.staleList}>
                {stale.map(({ goal, last, days }) => {
                    const content = (
                        <>
                            <span className={styles.staleDot} style={{ background: getGoalColor?.(goal.type) || 'var(--color-text-muted)' }} aria-hidden="true" />
                            <span className={styles.staleName}>
                                {goal.name}
                                <span className={styles.staleMeta}>
                                    {goal.level_name || goal.type}
                                    {last ? ` · last activity ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                                </span>
                            </span>
                            <span className={styles.staleDays}>{days} days</span>
                        </>
                    );
                    return (
                        <li key={goal.id}>
                            {rootId
                                ? <Link className={styles.staleRow} to={goalDeepLink(rootId, goal.id)}>{content}</Link>
                                : <div className={styles.staleRow}>{content}</div>}
                        </li>
                    );
                })}
            </ol>
        </>
    );
}

export function buildSessionTimeDistributionData(sessions = [], markers = DEFAULT_TIME_MARKERS) {
    const selectedMarkers = markers.length ? markers : ['start'];
    const labels = Array.from({ length: 24 }, (_, hour) => `${hour}:00`);
    const datasets = [];
    const countBy = (readDate) => {
        const counts = Array.from({ length: 24 }, () => 0);
        sessions.forEach((session) => {
            const date = readDate(session);
            if (date) counts[date.getHours()] += 1;
        });
        return counts;
    };

    if (selectedMarkers.includes('start')) {
        datasets.push({ label: 'Session Start', data: countBy(getSessionDate), slot: 0 });
    }
    if (selectedMarkers.includes('end')) {
        datasets.push({
            label: 'Session End',
            slot: 1,
            data: countBy((session) => {
                const date = session?.session_end ? new Date(session.session_end) : null;
                return date && !Number.isNaN(date.getTime()) ? date : null;
            }),
        });
    }
    return { labels, datasets };
}

export function SessionStartDistribution({ sessions = [], chartRef, markers = DEFAULT_TIME_MARKERS }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const data = useMemo(() => buildSessionTimeDistributionData(sessions, markers), [markers, sessions]);
    if (!sessions.some(getSessionDate)) return <ChartEmpty description="Start and end times appear once sessions have dates in this scope." />;
    return (
        <Bar
            ref={chartRef}
            data={{ ...data, datasets: data.datasets.map(({ slot, ...dataset }) => ({ ...dataset, ...barMarks(chartTheme.seriesColors[slot]) })) }}
            options={applyChartDensity(barOptions(chartTheme, { valueTitle: 'Sessions', legend: data.datasets.length > 1 }), density)}
        />
    );
}

function formatMinutesLabel(value) {
    if (value >= 60) {
        const hours = value / 60;
        return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
    }
    return `${Math.round(value)}m`;
}

export function buildSessionDurationHistogramData(sessions = [], bucketCount = 5) {
    const parsedBucketCount = Number(bucketCount);
    const safeBucketCount = Number.isFinite(parsedBucketCount)
        ? Math.max(1, Math.min(30, parsedBucketCount))
        : 5;
    const durations = sessions
        .map((session) => Math.max(0, Math.round((session.total_duration_seconds || 0) / 60)))
        .filter((minutes) => Number.isFinite(minutes));
    const maxMinutes = Math.max(...durations, 1);
    const bucketSize = Math.max(1, Math.ceil(maxMinutes / safeBucketCount));
    const buckets = Array.from({ length: safeBucketCount }, (_, index) => {
        const start = index * bucketSize;
        const end = index === safeBucketCount - 1 ? Infinity : ((index + 1) * bucketSize);
        const labelEnd = index === safeBucketCount - 1
            ? `${formatMinutesLabel(start)}+`
            : `${formatMinutesLabel(end)}`;
        return { start, end, label: `${formatMinutesLabel(start)}–${labelEnd}`, count: 0 };
    });

    durations.forEach((minutes) => {
        const bucket = buckets.find((item) => minutes >= item.start && minutes < item.end) || buckets[buckets.length - 1];
        bucket.count += 1;
    });

    return {
        labels: buckets.map((bucket) => bucket.label),
        datasets: [{ label: 'Sessions', data: buckets.map((bucket) => bucket.count) }],
    };
}

export function SessionDurationHistogram({ sessions = [], chartRef, bucketCount = 5 }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const data = useMemo(() => buildSessionDurationHistogramData(sessions, bucketCount), [bucketCount, sessions]);
    if (!sessions.length) return <ChartEmpty description="Session lengths appear once there are sessions in this scope." />;
    return (
        <Bar
            ref={chartRef}
            data={{ ...data, datasets: data.datasets.map((dataset) => ({ ...dataset, ...barMarks(chartTheme.seriesColors[0], HISTOGRAM_BAR_MARKS) })) }}
            options={applyChartDensity(barOptions(chartTheme, { valueTitle: 'Sessions' }), density)}
        />
    );
}

export function ActivityGroupMixChart({ activities = [], activityGroups = [], activityInstances = {}, chartRef }) {
    const rows = useMemo(() => {
        const groups = new Map(activityGroups.map((group) => [group.id, group.name]));
        const totals = new Map();
        activities.forEach((activity) => {
            const label = groups.get(activity.group_id) || 'Ungrouped';
            const count = (activityInstances[activity.id] || []).length;
            if (count > 0) totals.set(label, (totals.get(label) || 0) + count);
        });
        return [...totals.entries()].map(([label, value]) => ({ key: label, label, value }));
    }, [activities, activityGroups, activityInstances]);
    return (
        <SeriesDoughnut
            rows={rows}
            chartRef={chartRef}
            formatValue={(count) => `${count} ${count === 1 ? 'activity' : 'activities'}`}
            title="Activities by group"
            emptyDescription="The group mix appears once activities have been done in this scope."
        />
    );
}
