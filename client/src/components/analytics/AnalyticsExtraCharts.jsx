import React, { useMemo } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from './ChartJSWrapper';

const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b'];

function getSessionDate(session) {
    const value = session?.session_start || session?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dayKey(date) {
    return date.toISOString().slice(0, 10);
}

function formatDuration(seconds = 0) {
    const total = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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

export function SessionDurationTrend({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const points = sessions
            .map((session) => ({ x: getSessionDate(session), y: Math.round((session.total_duration_seconds || 0) / 60), name: session.name }))
            .filter((point) => point.x && point.y > 0)
            .sort((a, b) => a.x - b.x);
        return {
            datasets: [{
                label: 'Duration',
                data: points,
                borderColor: palette[0],
                backgroundColor: `${palette[0]}33`,
                pointRadius: 4,
                tension: 0.2,
            }],
        };
    }, [sessions]);
    if (!data.datasets[0].data.length) return <EmptyChart title="Session Duration Over Time" />;
    const options = chartScaffoldOptions('Session Duration Over Time', 'Minutes', true);
    options.plugins.tooltip.callbacks = {
        title: (ctx) => ctx[0]?.raw?.name || '',
        label: (ctx) => formatDuration((ctx.parsed.y || 0) * 60),
    };
    return <Line ref={chartRef} data={data} options={options} />;
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
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatDuration(ctx.raw)}` } },
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

export function SessionCompletionRateChart({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const rowsByWeek = new Map();
        sessions.forEach((session) => {
            const date = getSessionDate(session);
            if (!date) return;
            const key = dayKey(date);
            const row = rowsByWeek.get(key) || { total: 0, completed: 0 };
            row.total += 1;
            if (session.completed) row.completed += 1;
            rowsByWeek.set(key, row);
        });
        const rows = Array.from(rowsByWeek.entries()).sort(([a], [b]) => a.localeCompare(b));
        return { labels: rows.map(([label]) => label), datasets: [{ label: 'Completion rate', data: rows.map(([, row]) => row.total ? Math.round((row.completed / row.total) * 100) : 0), borderColor: palette[1], backgroundColor: `${palette[1]}33` }] };
    }, [sessions]);
    if (!data.labels.length) return <EmptyChart title="Session Completion Rate" />;
    return <Line ref={chartRef} data={data} options={chartScaffoldOptions('Session Completion Rate', 'Percent')} />;
}

export function SessionStartDistribution({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const counts = Array.from({ length: 24 }, () => 0);
        sessions.forEach((session) => {
            const date = getSessionDate(session);
            if (date) counts[date.getHours()] += 1;
        });
        return { labels: counts.map((_, hour) => `${hour}:00`), datasets: [{ label: 'Sessions', data: counts, backgroundColor: palette[4] }] };
    }, [sessions]);
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Session Start Time Distribution', 'Sessions')} />;
}

export function SessionDurationHistogram({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const buckets = [['0-15m', 0], ['15-30m', 0], ['30-60m', 0], ['1-2h', 0], ['2h+', 0]];
        sessions.forEach((session) => {
            const minutes = (session.total_duration_seconds || 0) / 60;
            if (minutes <= 15) buckets[0][1] += 1;
            else if (minutes <= 30) buckets[1][1] += 1;
            else if (minutes <= 60) buckets[2][1] += 1;
            else if (minutes <= 120) buckets[3][1] += 1;
            else buckets[4][1] += 1;
        });
        return { labels: buckets.map(([label]) => label), datasets: [{ label: 'Sessions', data: buckets.map(([, count]) => count), backgroundColor: palette[5] }] };
    }, [sessions]);
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Session Duration Histogram', 'Sessions')} />;
}

export function SessionPlannedVsActualChart({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const points = sessions.map((session) => {
            const planned = (session.sections || []).reduce((sum, section) => sum + ((section.estimated_duration_minutes || 0) * 60), 0);
            return { session, planned, actual: session.total_duration_seconds || 0 };
        }).filter((row) => row.planned > 0 || row.actual > 0).slice().reverse();
        return {
            labels: points.map((row) => row.session.name),
            datasets: [
                { label: 'Planned', data: points.map((row) => Math.round(row.planned / 60)), backgroundColor: palette[7] },
                { label: 'Actual', data: points.map((row) => Math.round(row.actual / 60)), backgroundColor: palette[0] },
            ],
        };
    }, [sessions]);
    if (!data.labels.length) return <EmptyChart title="Planned vs Actual Duration" />;
    return <Bar ref={chartRef} data={data} options={chartScaffoldOptions('Planned vs Actual Duration', 'Minutes')} />;
}

export function SessionConsistencyChart({ sessions = [], chartRef }) {
    const data = useMemo(() => {
        const rowsByDay = new Map();
        sessions.forEach((session) => {
            const date = getSessionDate(session);
            if (!date) return;
            const key = dayKey(date);
            const row = rowsByDay.get(key) || { count: 0, seconds: 0 };
            row.count += 1;
            row.seconds += session.total_duration_seconds || 0;
            rowsByDay.set(key, row);
        });
        const rows = Array.from(rowsByDay.entries()).sort(([a], [b]) => a.localeCompare(b));
        return {
            labels: rows.map(([label]) => label),
            datasets: [
                { label: 'Sessions', data: rows.map(([, row]) => row.count), borderColor: palette[0], backgroundColor: `${palette[0]}33`, yAxisID: 'y' },
                { label: 'Minutes', data: rows.map(([, row]) => Math.round(row.seconds / 60)), borderColor: palette[2], backgroundColor: `${palette[2]}33`, yAxisID: 'y1' },
            ],
        };
    }, [sessions]);
    if (!data.labels.length) return <EmptyChart title="Session Consistency" />;
    const options = chartScaffoldOptions('Session Consistency', 'Sessions');
    options.scales.y1 = { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartDefaults.textColor }, title: { display: true, text: 'Minutes', color: chartDefaults.textColor } };
    return <Line ref={chartRef} data={data} options={options} />;
}

export function ActivityTimeByActivity({ activities = [], activityInstances = {}, chartRef }) {
    const data = useMemo(() => {
        const rows = activities.map((activity) => ({ label: activity.name, seconds: (activityInstances[activity.id] || []).reduce((sum, instance) => sum + (instance.duration_seconds || 0), 0) })).filter((row) => row.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 15);
        return { labels: rows.map((row) => row.label), datasets: [{ label: 'Minutes', data: rows.map((row) => Math.round(row.seconds / 60)), backgroundColor: palette[1] }] };
    }, [activities, activityInstances]);
    if (!data.labels.length) return <EmptyChart title="Total Time Per Activity" />;
    return <Bar ref={chartRef} data={data} options={{ ...chartScaffoldOptions('Total Time Per Activity', 'Minutes'), indexAxis: 'y' }} />;
}

function metricValueFromInstance(instance, metricDef) {
    const values = [];
    if (Array.isArray(instance.metrics)) {
        instance.metrics.forEach((metric) => {
            if (metric.metric_id === metricDef.id && metric.value != null) values.push(Number(metric.value));
        });
    }
    if (Array.isArray(instance.sets)) {
        instance.sets.forEach((set) => (set.metrics || []).forEach((metric) => {
            if (metric.metric_id === metricDef.id && metric.value != null) values.push(Number(metric.value));
        }));
    }
    return values.filter((value) => Number.isFinite(value));
}

export function ActivityPersonalBestTrend({ selectedActivity, activityInstances = {}, activities = [], chartRef }) {
    const activity = activities.find((item) => item.id === selectedActivity?.id);
    const metric = activity?.metric_definitions?.find((item) => item.is_best_set_metric) || activity?.metric_definitions?.[0];
    const data = useMemo(() => {
        if (!selectedActivity || !metric) return { datasets: [] };
        let best = null;
        const points = (activityInstances[selectedActivity.id] || []).map((instance) => {
            const date = instance.session_date ? new Date(instance.session_date) : null;
            const values = metricValueFromInstance(instance, metric);
            if (!date || !values.length) return null;
            const current = Math.max(...values);
            best = best == null ? current : Math.max(best, current);
            return { x: date, y: best, name: instance.session_name };
        }).filter(Boolean).sort((a, b) => a.x - b.x);
        return { datasets: [{ label: metric.name, data: points, borderColor: palette[2], backgroundColor: `${palette[2]}33`, tension: 0.2 }] };
    }, [activityInstances, metric, selectedActivity]);
    if (!selectedActivity) return <EmptyChart title="Personal Best Trend">Select an activity above to view this chart.</EmptyChart>;
    if (!data.datasets[0]?.data?.length) return <EmptyChart title="Personal Best Trend" />;
    return <Line ref={chartRef} data={data} options={chartScaffoldOptions('Personal Best Trend', metric?.unit || '', true)} />;
}

export function ActivityMetricVolumeChart({ selectedActivity, activityInstances = {}, activities = [], chartRef }) {
    const activity = activities.find((item) => item.id === selectedActivity?.id);
    const metric = activity?.metric_definitions?.find((item) => item.is_additive) || activity?.metric_definitions?.[0];
    const data = useMemo(() => {
        if (!selectedActivity || !metric) return { labels: [], datasets: [] };
        const byDay = new Map();
        (activityInstances[selectedActivity.id] || []).forEach((instance) => {
            const date = instance.session_date ? new Date(instance.session_date) : null;
            if (!date) return;
            const key = dayKey(date);
            const values = metricValueFromInstance(instance, metric);
            byDay.set(key, (byDay.get(key) || 0) + values.reduce((sum, value) => sum + value, 0));
        });
        const rows = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
        return { labels: rows.map(([label]) => label), datasets: [{ label: metric.name, data: rows.map(([, value]) => value), borderColor: palette[3], backgroundColor: `${palette[3]}33` }] };
    }, [activityInstances, metric, selectedActivity]);
    if (!selectedActivity) return <EmptyChart title="Metric Volume Over Time">Select an activity above to view this chart.</EmptyChart>;
    if (!data.labels.length) return <EmptyChart title="Metric Volume Over Time" />;
    return <Line ref={chartRef} data={data} options={chartScaffoldOptions('Metric Volume Over Time', metric?.unit || '')} />;
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
