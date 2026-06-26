import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from '../ChartJSWrapper';
import { formatDurationSeconds } from '../../../utils/formatters';
import styles from './GraphProfileModal.module.css';

function formatTooltipMinutes(minutes) {
    return formatDurationSeconds(Math.round(minutes * 60));
}

export default function GoalDurationGraph({ data = {} }) {
    const rawPoints = data.points;
    const points = useMemo(() => (
        Array.isArray(rawPoints) ? rawPoints : []
    ), [rawPoints]);
    const goal = data.goal || {};
    const goalColor = goal.color || chartDefaults.primaryColor;

    const chartData = useMemo(() => ({
        labels: points.map((point) => new Date(point.date)),
        datasets: [
            {
                label: 'Activity Duration',
                data: points.map((point) => Math.round((point.activity_duration || 0) / 60)),
                borderColor: goalColor,
                backgroundColor: goalColor,
                borderWidth: 1.5,
                borderRadius: 0,
                borderSkipped: false,
                maxBarThickness: 42,
                categoryPercentage: 0.72,
                barPercentage: 0.9,
            },
        ],
    }), [goalColor, points]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: chartDefaults.textColor,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    font: { size: 11 },
                },
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                displayColors: true,
                callbacks: {
                    title: (items) => {
                        const raw = items[0]?.label;
                        const date = raw ? new Date(raw) : null;
                        if (!date || Number.isNaN(date.getTime())) return '';
                        return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        });
                    },
                    label: (item) => `${item.dataset.label}: ${formatTooltipMinutes(item.raw || 0)}`,
                },
            },
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                title: {
                    display: true,
                    text: 'Date',
                    color: chartDefaults.textColor,
                    font: { size: 12 },
                },
                ticks: { color: chartDefaults.textColor },
                grid: { color: chartDefaults.gridColor },
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Duration (min)',
                    color: chartDefaults.textColor,
                    font: { size: 12 },
                },
                ticks: {
                    color: chartDefaults.textColor,
                    callback: (value) => formatTooltipMinutes(value),
                },
                grid: { color: chartDefaults.gridColor },
            },
        },
    }), []);

    if (!points.some((point) => point.activity_duration > 0)) {
        return (
            <div className={styles.emptyState}>
                No time evidence has been recorded for this goal.
            </div>
        );
    }

    return <Bar data={chartData} options={options} />;
}
