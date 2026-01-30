import React, { useEffect, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    Filler
);

/**
 * Helper to get computed CSS variable value
 */
const getCSSVar = (name) => {
    if (typeof window !== 'undefined') {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || undefined;
    }
    return undefined;
};

/**
 * Hook to get chart options that update with theme changes
 * Resolves CSS variables to actual color strings for Chart.js compatibility
 */
export function useChartOptions({
    title = '',
    xAxisLabel = '',
    yAxisLabel = '',
    isTimeScale = false
}) {
    const [options, setOptions] = useState(createChartOptions({ title, xAxisLabel, yAxisLabel, isTimeScale }));

    useEffect(() => {
        // Function to update options based on current theme
        const updateOptions = () => {
            const defaults = {
                textColor: getCSSVar('--color-text-secondary') || '#ccc',
                gridColor: getCSSVar('--color-border') || '#333',
                fontFamily: getCSSVar('--font-family') || "'Segoe UI', sans-serif",
                tooltipBg: getCSSVar('--color-bg-tooltip') || 'rgba(30, 30, 30, 0.95)',
                tooltipText: getCSSVar('--color-text-primary') || '#fff',
                tooltipBody: getCSSVar('--color-text-secondary') || '#ccc',
                tooltipBorder: getCSSVar('--color-border') || '#444'
            };

            setOptions({
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: !!title,
                        text: title,
                        color: defaults.textColor,
                        font: {
                            size: 16,
                            family: defaults.fontFamily
                        }
                    },
                    tooltip: {
                        backgroundColor: defaults.tooltipBg,
                        titleColor: defaults.tooltipText,
                        bodyColor: defaults.tooltipBody,
                        borderColor: defaults.tooltipBorder,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 6,
                        displayColors: false,
                        titleFont: {
                            family: defaults.fontFamily
                        },
                        bodyFont: {
                            family: defaults.fontFamily
                        }
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
                            color: defaults.textColor,
                            font: {
                                size: 12,
                                family: defaults.fontFamily
                            }
                        },
                        ticks: {
                            color: defaults.textColor,
                            font: {
                                family: defaults.fontFamily
                            }
                        },
                        grid: {
                            color: defaults.gridColor
                        }
                    },
                    y: {
                        title: {
                            display: !!yAxisLabel,
                            text: yAxisLabel,
                            color: defaults.textColor,
                            font: {
                                size: 12,
                                family: defaults.fontFamily
                            }
                        },
                        ticks: {
                            color: defaults.textColor,
                            font: {
                                family: defaults.fontFamily
                            }
                        },
                        grid: {
                            color: defaults.gridColor
                        }
                    }
                }
            });
        };

        // Initial update
        updateOptions();

        // Listen for theme changes (mutation observer on html attribute)
        const observer = new MutationObserver(updateOptions);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

        return () => observer.disconnect();
    }, [title, xAxisLabel, yAxisLabel, isTimeScale]);

    return options;
}

/**
 * Chart.js configuration defaults for consistent styling using CSS variables
 * @deprecated Use useChartOptions hook instead for theme support
 */
export const chartDefaults = {
    backgroundColor: '#1e1e1e', // Fallbacks
    gridColor: '#333',
    textColor: '#ccc',
    primaryColor: '#2196f3',
    secondaryColor: '#e91e63',
    borderColor: '#2196f3',
    font: {
        family: "'Segoe UI', sans-serif"
    }
};

/**
 * Static creator for initial state / server side
 */
export function createChartOptions(props) {
    // Return safe defaults using vars (might not work in all canvas contexts but safer than nothing)
    return {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: { display: !!props.title, text: props.title },
            tooltip: { enabled: true }
        },
        scales: {
            x: { display: true },
            y: { display: true }
        }
    };
}

export default ChartJS;
