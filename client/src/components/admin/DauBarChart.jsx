import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../analytics/ChartJSWrapper';

/**
 * Daily-active-users bar chart for the admin usage dashboard. Uses the shared
 * Chart.js registration/theming from the analytics layer.
 */
function DauBarChart({ dau = [], windowStart, windowEnd }) {
    const chartTheme = useChartThemeDefaults();

    const chartData = useMemo(() => ({
        labels: dau.map((day) => day.date),
        datasets: [
            {
                label: 'Active users',
                data: dau.map((day) => day.count),
                backgroundColor: `${chartTheme.primaryColor}cc`,
                borderColor: chartTheme.primaryColor,
                borderWidth: 1,
            },
        ],
    }), [dau, chartTheme]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                callbacks: {
                    label: (context) => ` ${context.parsed.y} active user${context.parsed.y === 1 ? '' : 's'}`,
                },
            },
        },
        scales: {
            x: {
                title: { display: true, text: 'Date', color: chartTheme.textColor },
                ticks: {
                    color: chartTheme.textColor,
                    maxRotation: 60,
                    autoSkip: true,
                    maxTicksLimit: 16,
                },
                grid: { display: false },
            },
            y: {
                title: { display: true, text: 'Active users', color: chartTheme.textColor },
                beginAtZero: true,
                ticks: { color: chartTheme.textColor, precision: 0 },
                grid: { color: chartTheme.gridColor },
            },
        },
    }), [chartTheme]);

    return (
        <div
            role="img"
            aria-label={`Daily active users from ${windowStart} to ${windowEnd}`}
            style={{ height: '220px' }}
        >
            <Bar data={chartData} options={options} />
        </div>
    );
}

export default DauBarChart;
