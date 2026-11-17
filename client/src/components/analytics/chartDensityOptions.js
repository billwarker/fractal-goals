// Chart.js options for a chart's density (see ChartDensityContext in ChartJSWrapper): compact
// charts drop titles, legends and axis titles; expanded charts draw on the page's own grid.

const COMPACT_TICKS = { x: 4, y: 3 };
// A compact chart's y axes each take at most this much width, so two of them leave room to plot.
const COMPACT_Y_AXIS_MAX_WIDTH = 40;

const isYScale = (id, scale) => !(scale?.axis || id || '').startsWith('x');

/**
 * `color`: the series this axis carries. With two value axes and no axis titles, its ticks and
 * border take the series' colour, so each axis reads as its line's.
 */
function compactScale(id, scale = {}, { color = null, multiAxis = false } = {}) {
    const axis = isYScale(id, scale) ? 'y' : 'x';
    const tinted = axis === 'y' && multiAxis && color;
    return {
        ...scale,
        title: { ...(scale.title || {}), display: false },
        ticks: {
            ...(scale.ticks || {}),
            ...(tinted ? { color } : {}),
            maxTicksLimit: COMPACT_TICKS[axis],
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            font: { ...(scale.ticks?.font || {}), size: 10 },
        },
        ...(tinted ? { border: { ...(scale.border || {}), color } } : {}),
        ...(axis === 'y' && multiAxis ? {
            afterFit: (fitted) => {
                scale.afterFit?.(fitted);
                fitted.width = Math.min(fitted.width, COMPACT_Y_AXIS_MAX_WIDTH);
            },
        } : {}),
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

/**
 * A chart's Chart.js options for its density; 'full' returns them unchanged. `axisColors` maps a
 * y scale id to the colour of the series it carries, for compact charts with two value axes.
 */
export function applyChartDensity(options, density, { axisColors = {} } = {}) {
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
        scales: compactScales(options.scales || {}, axisColors),
    };
}

function compactScales(scales, axisColors) {
    const multiAxis = Object.entries(scales).filter(([id, scale]) => isYScale(id, scale)).length > 1;
    return Object.fromEntries(Object.entries(scales).map(([id, scale]) => [
        id, compactScale(id, scale, { color: axisColors[id] || null, multiAxis }),
    ]));
}
