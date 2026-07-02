import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import EmptyState from '../../common/EmptyState';
import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../ChartJSWrapper';
import { formatDurationSeconds } from '../../../utils/formatters';
import styles from './GraphProfileModal.module.css';

function formatTooltipMinutes(minutes) {
    return formatDurationSeconds(Math.round(minutes * 60));
}

export default function GoalDurationGraph({ data = {} }) {
    const chartTheme = useChartThemeDefaults();
    const rawPoints = data.points;
    const points = useMemo(() => (
        Array.isArray(rawPoints) ? rawPoints : []
    ), [rawPoints]);
    const goal = data.goal || {};
    const goalColor = goal.color || chartTheme.primaryColor;

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
                    color: chartTheme.textColor,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    font: { size: 11 },
                },
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
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
                    color: chartTheme.textColor,
                    font: { size: 12 },
                },
                ticks: { color: chartTheme.textColor },
                grid: { color: chartTheme.gridColor },
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Duration (min)',
                    color: chartTheme.textColor,
                    font: { size: 12 },
                },
                ticks: {
                    color: chartTheme.textColor,
                    callback: (value) => formatTooltipMinutes(value),
                },
                grid: { color: chartTheme.gridColor },
            },
        },
    }), [chartTheme]);

    if (!points.some((point) => point.activity_duration > 0)) {
        return <EmptyState compact className={styles.emptyState} description="No time evidence has been recorded for this goal." />;
    }

    return <Bar data={chartData} options={options} />;
}
