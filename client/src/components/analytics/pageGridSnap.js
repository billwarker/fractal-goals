/**
 * Snaps an "expanded" chart onto the page's background grid (the nearest `[data-page-grid]`, else
 * `.content-container`; 20px cells, 16px on mobile): the plot fills its panel with its edges on grid lines, and category points (dates,
 * bars) and the primary value axis's ticks snap to grid lines when that costs little space. Charts opt in through
 * `plugins.pageGridSnap.enabled` (applyChartDensity's 'expanded' density), and the expanded goal
 * chart and the Analytics page's panels register it, keeping it out of other routes. It works through the chart's scriptable layout
 * padding: each layout measures the plot, and if it's off the grid the padding is adjusted and the
 * chart re-laid out (a few passes at most, since tick counts can shift).
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

const pageGridSnap = {
    id: 'pageGridSnap',
    defaults: { enabled: false },
    resize(chart) {
        chart.$pageGridPasses = 0;
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

        const shiftLeft = gridShift(left, cell);
        const shiftTop = gridShift(top, cell);
        const x = divisions(primaryScale(chart, 'x'), cell);
        const y = divisions(primaryScale(chart, 'y'), cell);
        const width = snappedLength(right - left - shiftLeft, cell, x.segments, x.unit);
        const height = snappedLength(bottom - top - shiftTop, cell, y.segments, y.unit);
        // Whole-cell steps can leave slack; split it in whole cells so the plot stays centred.
        const slackX = Math.max(0, right - left - shiftLeft - width);
        const slackY = Math.max(0, bottom - top - shiftTop - height);
        const leadX = Math.floor(slackX / 2 / cell) * cell;
        const leadY = Math.floor(slackY / 2 / cell) * cell;
        const next = {
            left: base.left + shiftLeft + leadX,
            top: base.top + shiftTop + leadY,
            right: base.right + slackX - leadX,
            bottom: base.bottom + slackY - leadY,
        };
        const changed = SIDES.some((side) => Math.abs(next[side] - current[side]) >= 0.5);
        if (!changed) {
            chart.$pageGridPasses = 0;
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
