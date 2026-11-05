/**
 * Room beyond the data while setting a goal from a chart. An extension is how far each end of each
 * axis reaches past its data, as a share of the data's range: { x: { low, high }, y: { low, high } }.
 * Set on a chart as `chart.$axisExtension`, it applies to the chart's linear scales through this
 * plugin, so charts need no changes of their own; category axes (past sessions, activities) stay as
 * they are. Goal values come from the scales, so the crosshair and snapping follow the wider range.
 */

const HEADROOM = 0.25;
const GROWTH = 0.5;

export const headroomExtension = () => ({
    x: { low: HEADROOM, high: HEADROOM },
    y: { low: HEADROOM, high: HEADROOM },
});

/** One end of an axis grown by half of the axis's current range. */
export function growEnd(extension, axis, end) {
    const { low, high } = extension[axis];
    const grown = extension[axis][end] + GROWTH * (1 + low + high);
    return { ...extension, [axis]: { ...extension[axis], [end]: grown } };
}

/** Whether an end has been extended past the headroom, so it can be pulled back. */
export const canShrink = (extension, axis, end) => extension[axis][end] > HEADROOM + 1e-6;

/** Undo one `growEnd` of this end, never below the headroom. */
export function shrinkEnd(extension, axis, end) {
    const other = extension[axis][end === 'low' ? 'high' : 'low'];
    const shrunk = (extension[axis][end] - GROWTH * (1 + other)) / (1 + GROWTH);
    return { ...extension, [axis]: { ...extension[axis], [end]: Math.max(HEADROOM, shrunk) } };
}

/**
 * The limits with their extension. An axis whose data starts at zero or above stays there, so a
 * lower-is-better metric gets room below its best without ever showing negative values.
 */
export function extendedLimits({ min, max }, { low, high }) {
    const span = max - min || Math.abs(max) || 1;
    const extendedMin = min - span * low;
    return { min: min >= 0 ? Math.max(0, extendedMin) : extendedMin, max: max + span * high };
}

/** The ends of a chart's axes that can extend, for its Set goal controls. */
export function extendableEnds(chart) {
    const scales = Object.values(chart.scales || {}).filter((scale) => scale.type === 'linear');
    const ends = { x: { low: false, high: false }, y: { low: false, high: false } };
    scales.forEach((scale) => {
        const axis = ends[scale.axis];
        if (!axis) return;
        axis.high = true;
        // At zero there's nothing lower to show (see extendedLimits).
        axis.low = axis.low || scale.min !== 0;
    });
    // A running total's time axis has its own room: more future dates.
    if ((chart.data?.datasets || []).some((dataset) => dataset.runningTotal)) ends.x.high = true;
    return ends;
}

/** Give a chart this extension (or none), redrawing if that changes it; `onLayout` follows its layouts. */
export function applyAxisExtension(chart, extension, onLayout) {
    chart.$axisExtensionLayout = onLayout;
    if (chart.$axisExtension === extension) return;
    chart.$axisExtension = extension;
    chart.update('none');
}

const axisExtension = {
    id: 'axisExtension',
    afterDataLimits(chart, { scale }) {
        const extension = chart.$axisExtension?.[scale.axis];
        if (!extension || scale.type !== 'linear') return;
        // beginAtZero applies after this hook, so measure the range the axis will really show.
        const fromZero = scale.options.beginAtZero;
        const limits = extendedLimits({
            min: fromZero ? Math.min(0, scale.min) : scale.min,
            max: fromZero ? Math.max(0, scale.max) : scale.max,
        }, extension);
        scale.min = limits.min;
        scale.max = limits.max;
    },
    // The grid snap re-lays a chart out over a few frames, and a resize moves it too.
    afterLayout(chart) {
        chart.$axisExtensionLayout?.();
    },
};

export default axisExtension;
