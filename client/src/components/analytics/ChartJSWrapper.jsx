import React, { useEffect, useMemo, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    Filler,
    annotationPlugin
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

export const DISABLED_CHART_ANIMATION = {
    animation: false,
    animations: {
        colors: false,
        x: false,
        y: false,
    },
    transitions: {
        active: {
            animation: {
                duration: 0,
            },
        },
        resize: {
            animation: {
                duration: 0,
            },
        },
        show: {
            animations: {
                x: { duration: 0 },
                y: { duration: 0 },
            },
        },
        hide: {
            animations: {
                x: { duration: 0 },
                y: { duration: 0 },
            },
        },
    },
};

const DEFAULT_LAYOUT_PADDING = Object.freeze({ top: 8, right: 16, bottom: 16, left: 8 });

const resolveLayoutPadding = (layoutPadding = DEFAULT_LAYOUT_PADDING) => ({
    top: layoutPadding.top ?? DEFAULT_LAYOUT_PADDING.top,
    right: layoutPadding.right ?? DEFAULT_LAYOUT_PADDING.right,
    bottom: layoutPadding.bottom ?? DEFAULT_LAYOUT_PADDING.bottom,
    left: layoutPadding.left ?? DEFAULT_LAYOUT_PADDING.left,
});

/**
 * Hook to get chart options that update with theme changes
 * Resolves CSS variables to actual color strings for Chart.js compatibility
 */
export function useChartOptions({
    title = '',
    xAxisLabel = '',
    yAxisLabel = '',
    isTimeScale = false,
    layoutPadding = DEFAULT_LAYOUT_PADDING
}) {
    const rawLayoutPadding = layoutPadding || DEFAULT_LAYOUT_PADDING;
    const paddingTop = rawLayoutPadding.top ?? DEFAULT_LAYOUT_PADDING.top;
    const paddingRight = rawLayoutPadding.right ?? DEFAULT_LAYOUT_PADDING.right;
    const paddingBottom = rawLayoutPadding.bottom ?? DEFAULT_LAYOUT_PADDING.bottom;
    const paddingLeft = rawLayoutPadding.left ?? DEFAULT_LAYOUT_PADDING.left;
    const stableLayoutPadding = useMemo(() => ({
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
    }), [paddingTop, paddingRight, paddingBottom, paddingLeft]);

    const [options, setOptions] = useState(createChartOptions({
        title,
        xAxisLabel,
        yAxisLabel,
        isTimeScale,
        layoutPadding: stableLayoutPadding,
    }));

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
                ...DISABLED_CHART_ANIMATION,
                layout: {
                    padding: stableLayoutPadding
                },
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
    }, [title, xAxisLabel, yAxisLabel, isTimeScale, stableLayoutPadding]);

    return options;
}

export function useChartThemeDefaults() {
    const [defaults, setDefaults] = useState(() => ({
        backgroundColor: chartDefaults.backgroundColor,
        gridColor: getCSSVar('--color-border') || chartDefaults.gridColor,
        textColor: getCSSVar('--color-text-secondary') || chartDefaults.textColor,
        primaryColor: getCSSVar('--color-primary') || chartDefaults.primaryColor,
        secondaryColor: getCSSVar('--color-accent') || chartDefaults.secondaryColor,
        borderColor: getCSSVar('--color-primary') || chartDefaults.borderColor,
        tooltipBg: getCSSVar('--color-bg-tooltip') || 'rgba(30, 30, 30, 0.95)',
        tooltipText: getCSSVar('--color-text-primary') || '#fff',
        tooltipBody: getCSSVar('--color-text-secondary') || '#ddd',
        tooltipBorder: getCSSVar('--color-border') || '#444',
        font: chartDefaults.font,
    }));

    useEffect(() => {
        const updateDefaults = () => {
            setDefaults({
                backgroundColor: chartDefaults.backgroundColor,
                gridColor: getCSSVar('--color-border') || chartDefaults.gridColor,
                textColor: getCSSVar('--color-text-secondary') || chartDefaults.textColor,
                primaryColor: getCSSVar('--color-primary') || chartDefaults.primaryColor,
                secondaryColor: getCSSVar('--color-accent') || chartDefaults.secondaryColor,
                borderColor: getCSSVar('--color-primary') || chartDefaults.borderColor,
                tooltipBg: getCSSVar('--color-bg-tooltip') || 'rgba(30, 30, 30, 0.95)',
                tooltipText: getCSSVar('--color-text-primary') || '#fff',
                tooltipBody: getCSSVar('--color-text-secondary') || '#ddd',
                tooltipBorder: getCSSVar('--color-border') || '#444',
                font: chartDefaults.font,
            });
        };

        updateDefaults();
        const observer = new MutationObserver(updateDefaults);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
        return () => observer.disconnect();
    }, []);

    return defaults;
}

/**
 * Static Chart.js color fallbacks for chart configs built outside a React
 * render.
 * For theme-reactive options inside a component, prefer the useChartOptions
 * or useChartThemeDefaults hook.
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
    const layoutPadding = resolveLayoutPadding(props.layoutPadding);

    // Return safe defaults using vars (might not work in all canvas contexts but safer than nothing)
    return {
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        layout: {
            padding: layoutPadding
        },
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

/**
 * Chart density. Charts in small spaces (goal details, narrow panels) render "compact": no title,
 * legend or axis titles, fewer ticks, smaller points and unlabelled reference lines (tooltips
 * stay). "expanded" (a goal chart in place of the flow tree) is full detail drawn on the page's
 * own background grid: the chart draws no gridlines or axis borders of its own. A surrounding
 * ChartDensityContext.Provider sets it; charts read it with useChartDensity and pass their
 * options through applyChartDensity.
 */
export const ChartDensityContext = React.createContext('full');

export function useChartDensity() {
    return React.useContext(ChartDensityContext);
}

const COMPACT_TICKS = { x: 4, y: 3 };

function compactScale(id, scale = {}) {
    const axis = (scale.axis || id || '').startsWith('x') ? 'x' : 'y';
    return {
        ...scale,
        title: { ...(scale.title || {}), display: false },
        ticks: {
            ...(scale.ticks || {}),
            maxTicksLimit: COMPACT_TICKS[axis],
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            font: { ...(scale.ticks?.font || {}), size: 10 },
        },
    };
}

const SIDES = ['top', 'right', 'bottom', 'left'];

/** Layout padding the pageGridSnap plugin can adjust (it reads the chart's own as `$pageGridBase`). */
function pageGridPadding(padding) {
    const base = Object.fromEntries(SIDES.map((side) => [side, Number(typeof padding === 'number' ? padding : padding?.[side]) || 0]));
    return ({ chart }) => {
        chart.$pageGridBase = base;
        return chart.$pageGridPad || base;
    };
}

/**
 * A chart drawn on the page grid: its scales draw no gridlines (the page grid is the chart's grid)
 * but draw visible axis lines and keep their ticks, and pageGridSnap (registered by the expanded goal chart)
 * puts the plot, its points and its primary ticks on the grid's lines.
 */
function onPageGrid(options) {
    return {
        ...options,
        layout: { ...(options.layout || {}), padding: pageGridPadding(options.layout?.padding) },
        plugins: { ...(options.plugins || {}), pageGridSnap: { enabled: true } },
        scales: Object.fromEntries(Object.entries(options.scales || {}).map(([id, scale]) => [id, {
            ...scale,
            grid: { ...(scale?.grid || {}), display: false },
            // Axis lines in the tick colour: Chart.js's default border all but vanishes on the grid.
            border: { ...(scale?.border || {}), color: scale?.ticks?.color || 'rgba(148, 163, 184, 0.8)', width: 1, display: true },
        }])),
    };
}

/** A chart's Chart.js options for its density; 'full' returns them unchanged. */
export function applyChartDensity(options, density) {
    if (!options) return options;
    if (density === 'expanded') return onPageGrid(options);
    if (density !== 'compact') return options;
    const plugins = options.plugins || {};
    const annotations = plugins.annotation?.annotations;
    return {
        ...options,
        layout: { ...(options.layout || {}), padding: 4 },
        elements: {
            ...(options.elements || {}),
            point: { ...(options.elements?.point || {}), radius: 2, hoverRadius: 3 },
        },
        plugins: {
            ...plugins,
            title: { ...(plugins.title || {}), display: false },
            legend: { ...(plugins.legend || {}), display: false },
            ...(annotations ? {
                annotation: {
                    ...plugins.annotation,
                    annotations: Object.fromEntries(Object.entries(annotations).map(([key, value]) => [
                        key, value?.label ? { ...value, label: { ...value.label, display: false } } : value,
                    ])),
                },
            } : {}),
        },
        scales: Object.fromEntries(Object.entries(options.scales || {}).map(([id, scale]) => [id, compactScale(id, scale)])),
    };
}

export default ChartJS;
