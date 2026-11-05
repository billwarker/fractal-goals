/**
 * Snaps an "expanded" chart onto the page's background grid (the nearest `[data-page-grid]`, else
 * `.content-container`; 20px cells, 16px on mobile): the plot fills its panel with its edges on grid lines, and category points (dates,
 * bars) and the primary value axis's ticks snap to grid lines when that costs little space. Charts opt in through
 * `plugins.pageGridSnap.enabled` (applyChartDensity's 'expanded' density), and the expanded goal
 * chart and the Analytics page's panels register it, keeping it out of other routes. It works through the chart's scriptable layout
 * padding: each layout measures the plot, and if it's off the grid the padding is adjusted and the
 * chart re-laid out (a few passes at most, since tick counts can shift). A chart aligned with others
 * (`chart.$alignedEdges`, `chart.$alignedRows`; alignedAxes/) lays out within the space they all share, so
 * equal inputs snap to the same grid lines.
 */

const MAX_PASSES = 4;
const SIDES = ['top', 'right', 'bottom', 'left'];

/** Pixels to move `position` forward onto the next grid line. */
export function gridShift(position, cell) {
    const remainder = ((position % cell) + cell) % cell;
    return remainder < 0.5 || cell - remainder < 0.5 ? 0 : cell - remainder;
}

// Snapping every point or tick may cost at most this share of the space; past it the chart fills.
const MAX_SNAP_LOSS = 0.1;

/**
 * The length the plot takes within `available`: the longest whose `segments` steps are each a whole
 * number of `unit`s (so every point or tick lands on a grid line) when that loses little space,
 * otherwise whole cells, so the chart fills the panel with its edges on grid lines.
 */
export function snappedLength(available, cell, segments = 0, unit = cell) {
    const filled = Math.max(cell, Math.floor(available / cell) * cell);
    if (segments > 0) {
        const block = unit * segments;
        const snapped = Math.floor(available / block) * block;
        if (snapped > 0 && filled - snapped <= available * MAX_SNAP_LOSS) return snapped;
    }
    return filled;
}

function primaryScale(chart, axis) {
    const scales = Object.values(chart.scales || {});
    const side = axis === 'x' ? 'bottom' : 'left';
    return scales.find((scale) => scale.axis === axis && scale.position === side) || scales.find((scale) => scale.axis === axis);
}

/** How a scale's length divides: category points (with or without bar offsets) or ticks. */
function divisions(scale, cell) {
    if (!scale) return { segments: 0, unit: cell };
    if (scale.type === 'category') {
        const count = Math.max(0, Math.round(scale.max - scale.min) + 1);
        return scale.options.offset ? { segments: count, unit: cell * 2 } : { segments: Math.max(count - 1, 1), unit: cell };
    }
    return { segments: Math.max((scale.ticks?.length || 0) - 1, 0), unit: cell };
}

function gridFor(canvas) {
    // A page that draws its own grid (Analytics' workspace) marks it with data-page-grid.
    const container = canvas?.closest?.('[data-page-grid], .content-container');
    if (!container) return null;
    const cell = parseFloat(getComputedStyle(container).backgroundSize) || 20;
    const origin = container.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    return { cell, x: box.left - origin.left, y: box.top - origin.top };
}

/** Called when the chart settles after re-laying itself out, which happens without a React render. */
export function onGridLayoutSettled(chart, listener) {
    if (listener) chart.$onGridLayout = listener;
    else delete chart.$onGridLayout;
}

const pageGridSnap = {
    id: 'pageGridSnap',
    defaults: { enabled: false },
    resize(chart) {
        chart.$pageGridPasses = 0;
        chart.$alignedEdges?.restart();
        chart.$alignedRows?.restart();
    },
    afterLayout(chart, _args, options) {
        if (!options?.enabled || !chart.chartArea) return;
        const grid = gridFor(chart.canvas);
        if (!grid) return;
        const { cell } = grid;
        const base = chart.$pageGridBase || { top: 0, right: 0, bottom: 0, left: 0 };
        const current = chart.$pageGridPad || base;
        const area = chart.chartArea;
        // The space before this plugin's adjustments, in page-grid coordinates.
        const left = grid.x + area.left - (current.left - base.left);
        const top = grid.y + area.top - (current.top - base.top);
        const right = grid.x + area.right + (current.right - base.right);
        const bottom = grid.y + area.bottom + (current.bottom - base.bottom);
        const shared = chart.$alignedEdges?.report(chart, { left, right }) || { left, right };
        const rows = chart.$alignedRows?.report(chart, { left: top, right: bottom }) || { left: top, right: bottom };

        const shiftLeft = gridShift(shared.left, cell);
        const shiftTop = gridShift(rows.left, cell);
        const x = divisions(primaryScale(chart, 'x'), cell);
        // Side-by-side charts must keep equal heights, so ticks don't get a say in theirs.
        const y = chart.$alignedRows ? { segments: 0, unit: cell } : divisions(primaryScale(chart, 'y'), cell);
        const width = snappedLength(shared.right - shared.left - shiftLeft, cell, x.segments, x.unit);
        const height = snappedLength(rows.right - rows.left - shiftTop, cell, y.segments, y.unit);
        // Whole-cell steps can leave slack; split it in whole cells so the plot stays centred.
        const slackX = Math.max(0, shared.right - shared.left - shiftLeft - width);
        const slackY = Math.max(0, rows.right - rows.left - shiftTop - height);
        const leadX = Math.floor(slackX / 2 / cell) * cell;
        const leadY = Math.floor(slackY / 2 / cell) * cell;
        const plotLeft = shared.left + shiftLeft + leadX;
        const plotTop = rows.left + shiftTop + leadY;
        const next = {
            left: base.left + (plotLeft - left),
            top: base.top + (plotTop - top),
            right: base.right + (right - (plotLeft + width)),
            bottom: base.bottom + (bottom - (plotTop + height)),
        };
        const changed = SIDES.some((side) => Math.abs(next[side] - current[side]) >= 0.5);
        if (!changed) {
            chart.$pageGridPasses = 0;
            chart.$onGridLayout?.();
            // For tests and debugging: where an aligned plot settled, and how many slots it has.
            if (chart.$alignedEdges) chart.canvas.dataset.alignedPlot = `${plotLeft}:${plotLeft + width}:${x.segments}`;
            if (chart.$alignedRows) {
                const scale = primaryScale(chart, 'y');
                chart.canvas.dataset.alignedRows = `${plotTop}:${plotTop + height}:${scale?.min}:${scale?.max}`;
            }
            return;
        }
        if ((chart.$pageGridPasses || 0) >= MAX_PASSES) return;
        chart.$pageGridPasses = (chart.$pageGridPasses || 0) + 1;
        chart.$pageGridPad = next;
        requestAnimationFrame(() => {
            if (chart.canvas) chart.update('none');
        });
    },
};

export default pageGridSnap;
