import React, { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from './ChartJSWrapper';
import { formatDurationSeconds } from '../../utils/formatters';

const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b'];
const DEFAULT_TIME_MARKERS = ['start'];

function getSessionDate(session) {
    const value = session?.session_start || session?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function EmptyChart({ title, children = 'No data available yet' }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {title && <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>{title}</h3>}
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>
                {children}
            </div>
        </div>
    );
}

function chartScaffoldOptions(title, yAxisLabel, isTimeScale = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
            },
            title: { display: Boolean(title), text: title, color: chartDefaults.textColor },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ddd',
                padding: 12,
            },
        },
        scales: {
            x: {
                type: isTimeScale ? 'time' : 'category',
                time: isTimeScale ? { unit: 'day', displayFormats: { day: 'MMM d' } } : undefined,
                ticks: { color: chartDefaults.textColor },
                grid: { color: chartDefaults.gridColor },
            },
            y: {
                beginAtZero: true,
                title: { display: Boolean(yAxisLabel), text: yAxisLabel, color: chartDefaults.textColor },
                ticks: { color: chartDefaults.textColor },
                grid: { color: chartDefaults.gridColor },
            },
        },
    };
}

export function SessionSectionPie({ sessions = [], activityInstances = {}, chartRef }) {
    const data = useMemo(() => {
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
        const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
        return {
            labels: rows.map(([label]) => label),
            datasets: [{ data: rows.map(([, seconds]) => seconds), backgroundColor: rows.map((_, index) => palette[index % palette.length]), borderWidth: 0 }],
        };
    }, [activityInstances, sessions]);
    if (!data.labels.length) return <EmptyChart title="Time Spent By Session Section">Section duration appears after activities have tracked time inside session sections.</EmptyChart>;
    return (
        <Doughnut
            ref={chartRef}
            data={data}
            options={{
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                plugins: {
                    legend: { position: 'right', labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8 } },
                    title: { display: true, text: 'Time Spent By Session Section', color: chartDefaults.textColor },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatDurationSeconds(ctx.raw)}` } },
                },
            }}
        />
    );
}

export function GoalCompletionRateByLevel({ goals = [], chartRef }) {
    const data = useMemo(() => {
        const counts = new Map();
        goals.forEach((goal) => {
            const key = (goal.type || 'Goal').replace('Goal', '') || 'Goal';
            const current = counts.get(key) || { total: 0, completed: 0 };
            current.total += 1;
            if (goal.completed) current.completed += 1;
            counts.set(key, current);
        });
        const rows = Array.from(counts.entries()).map(([label, value]) => ({
            label,
            rate: value.total ? Math.round((value.completed / value.total) * 100) : 0,
        }));
        return { labels: rows.map((row) => row.label), datasets: [{ label: 'Completion rate', data: rows.map((row) => row.rate), backgroundColor: palette[1] }] };
    }, [goals]);
    if (!data.labels.length) return <EmptyChart title="Goal Completion Rate By Level" />;
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Goal Completion Rate By Level', 'Percent')} />;
}

export function GoalAgingChart({ goals = [], chartRef }) {
    const data = useMemo(() => {
        const buckets = [['0-7 days', 0], ['8-30 days', 0], ['31-90 days', 0], ['90+ days', 0]];
        goals.filter((goal) => !goal.completed).forEach((goal) => {
            const age = goal.age_days || 0;
            if (age <= 7) buckets[0][1] += 1;
            else if (age <= 30) buckets[1][1] += 1;
            else if (age <= 90) buckets[2][1] += 1;
            else buckets[3][1] += 1;
        });
        return { labels: buckets.map(([label]) => label), datasets: [{ label: 'Active goals', data: buckets.map(([, count]) => count), backgroundColor: palette[2] }] };
    }, [goals]);
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Active Goal Aging', 'Goals')} />;
}

export function GoalMomentumChart({ goals = [], chartRef }) {
    const data = useMemo(() => {
        const rows = goals
            .map((goal) => ({ label: goal.name, seconds: (goal.activity_durations_by_date || []).reduce((sum, item) => sum + (item.duration_seconds || 0), 0) }))
            .filter((row) => row.seconds > 0)
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 12);
        return { labels: rows.map((row) => row.label), datasets: [{ label: 'Activity time', data: rows.map((row) => Math.round(row.seconds / 60)), backgroundColor: palette[3] }] };
    }, [goals]);
    if (!data.labels.length) return <EmptyChart title="Goal Momentum" />;
    return <Bar ref={chartRef} data={data} options={{ ...chartScaffoldOptions('Goal Momentum', 'Minutes'), indexAxis: 'y' }} />;
}

export function StaleGoalsChart({ goals = [] }) {
    const stale = useMemo(() => {
        const now = new Date();
        return goals
            .filter((goal) => !goal.completed)
            .map((goal) => {
                const dates = [
                    ...(goal.activity_durations_by_date || []).map((item) => item.date),
                    ...(goal.session_durations_by_date || []).map((item) => item.date),
                    goal.created_at,
                ].filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
                const last = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
                const days = last ? Math.floor((now - last) / 86400000) : 0;
                return { goal, days };
            })
            .filter((row) => row.days >= 14)
            .sort((a, b) => b.days - a.days)
            .slice(0, 10);
    }, [goals]);
    if (!stale.length) return <EmptyChart title="Stale Goals">No active goals are stale by the current data.</EmptyChart>;
    return (
        <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>Stale Goals</h3>
            {stale.map(({ goal, days }) => (
                <div key={goal.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 10, border: '1px solid var(--color-border)', borderRadius: 6 }}>
                    <span style={{ color: 'var(--color-text-primary)' }}>{goal.name}</span>
                    <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{days} days</span>
                </div>
            ))}
        </div>
    );
}

export function buildSessionTimeDistributionData(sessions = [], markers = DEFAULT_TIME_MARKERS) {
    const selectedMarkers = markers.length ? markers : ['start'];
    const labels = Array.from({ length: 24 }, (_, hour) => `${hour}:00`);
    const datasets = [];

    if (selectedMarkers.includes('start')) {
        const counts = Array.from({ length: 24 }, () => 0);
        sessions.forEach((session) => {
            const date = getSessionDate(session);
            if (date) counts[date.getHours()] += 1;
        });
        datasets.push({ label: 'Session Start', data: counts, backgroundColor: palette[4] });
    }

    if (selectedMarkers.includes('end')) {
        const counts = Array.from({ length: 24 }, () => 0);
        sessions.forEach((session) => {
            const value = session?.session_end;
            const date = value ? new Date(value) : null;
            if (date && !Number.isNaN(date.getTime())) counts[date.getHours()] += 1;
        });
        datasets.push({ label: 'Session End', data: counts, backgroundColor: palette[2] });
    }

    return { labels, datasets };
}

export function SessionStartDistribution({ sessions = [], chartRef, markers = DEFAULT_TIME_MARKERS }) {
    const data = useMemo(() => {
        return buildSessionTimeDistributionData(sessions, markers);
    }, [markers, sessions]);
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Session Start and End Time Distribution', 'Sessions')} />;
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
        return {
            start,
            end,
            label: `${formatMinutesLabel(start)}-${labelEnd}`,
            count: 0,
        };
    });

    durations.forEach((minutes) => {
        const bucket = buckets.find((item) => minutes >= item.start && minutes < item.end) || buckets[buckets.length - 1];
        bucket.count += 1;
    });

    return {
        labels: buckets.map((bucket) => bucket.label),
        datasets: [{ label: 'Sessions', data: buckets.map((bucket) => bucket.count), backgroundColor: palette[5] }],
    };
}

export function SessionDurationHistogram({ sessions = [], chartRef, bucketCount = 5 }) {
    const data = useMemo(() => {
        return buildSessionDurationHistogramData(sessions, bucketCount);
    }, [bucketCount, sessions]);
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Session Duration Histogram', 'Sessions')} />;
}

export function ActivityGroupMixChart({ activities = [], activityGroups = [], activityInstances = {}, chartRef }) {
    const data = useMemo(() => {
        const groups = new Map(activityGroups.map((group) => [group.id, group.name]));
        const totals = new Map();
        activities.forEach((activity) => {
            const label = groups.get(activity.group_id) || 'Ungrouped';
            const count = (activityInstances[activity.id] || []).length;
            if (count > 0) totals.set(label, (totals.get(label) || 0) + count);
        });
        const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
        return { labels: rows.map(([label]) => label), datasets: [{ data: rows.map(([, count]) => count), backgroundColor: rows.map((_, index) => palette[index % palette.length]), borderWidth: 0 }] };
    }, [activities, activityGroups, activityInstances]);
    if (!data.labels.length) return <EmptyChart title="Activity Mix By Group" />;
    return <Doughnut ref={chartRef} data={data} options={{ responsive: true, maintainAspectRatio: false, ...DISABLED_CHART_ANIMATION, plugins: { legend: { position: 'right', labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8 } }, title: { display: true, text: 'Activity Mix By Group', color: chartDefaults.textColor } } }} />;
}
