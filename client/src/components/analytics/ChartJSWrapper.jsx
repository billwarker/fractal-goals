import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
);

/**
 * Chart.js configuration defaults for consistent dark theme styling
 */
export const chartDefaults = {
    backgroundColor: '#1e1e1e',
    gridColor: '#333',
    textColor: '#ccc',
    primaryColor: '#2196f3',
    secondaryColor: '#e91e63',
    borderColor: '#1976d2',
    font: {
        family: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif"
    }
};

/**
 * Creates common Chart.js options for dark theme
 */
export function createChartOptions({
    title = '',
    xAxisLabel = '',
    yAxisLabel = '',
    isTimeScale = false
}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            title: {
                display: !!title,
                text: title,
                color: chartDefaults.textColor,
                font: {
                    size: 16,
                    family: chartDefaults.font.family
                }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                borderColor: '#444',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 6,
                displayColors: false
            }
        },
        scales: {
            x: {
                type: isTimeScale ? 'time' : 'linear',
                ...(isTimeScale && {
                    time: {
                        unit: 'day',
                        displayFormats: {
                            hour: 'MMM d, h a',
                            day: 'MMM d, yyyy',
                            week: 'MMM d, yyyy',
                            month: 'MMM yyyy'
                        },
                        tooltipFormat: 'MMM d, yyyy'
                    }
                }),
                title: {
                    display: !!xAxisLabel,
                    text: xAxisLabel,
                    color: chartDefaults.textColor,
                    font: {
                        size: 12,
                        family: chartDefaults.font.family
                    }
                },
                ticks: {
                    color: chartDefaults.textColor
                },
                grid: {
                    color: chartDefaults.gridColor
                }
            },
            y: {
                title: {
                    display: !!yAxisLabel,
                    text: yAxisLabel,
                    color: chartDefaults.textColor,
                    font: {
                        size: 12,
                        family: chartDefaults.font.family
                    }
                },
                ticks: {
                    color: chartDefaults.textColor
                },
                grid: {
                    color: chartDefaults.gridColor
                }
            }
        }
    };
}

export default ChartJS;
