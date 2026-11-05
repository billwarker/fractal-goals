/**
 * Hovering one of a set of aligned charts moves a shared crosshair across them all: stacked charts
 * (`chart.$alignedEdges`) share a vertical line through the same slot, each showing its tooltip for
 * it; side-by-side charts (`chart.$alignedRows`) share a horizontal line at the same value. The lines
 * and badges match the Set goal crosshair. A chart in Set goal mode (`chart.$axisExtension`) has its
 * own crosshair, so it neither leads nor follows.
 */

const inSetGoalMode = (chart) => Boolean(chart.$axisExtension);
const primaryYScale = (chart) => Object.values(chart.scales || {}).find((scale) => scale.axis === 'y' && scale.position === 'left')
    || Object.values(chart.scales || {}).find((scale) => scale.axis === 'y');

/** Which slot a pixel falls in, or null off the axis. */
export function slotAt(scale, pixel, slotCount) {
    if (!scale || !slotCount) return null;
    const index = Math.round(scale.getValueForPixel(pixel));
    return index >= 0 && index < slotCount ? index : null;
}

/** An axis value as a short label, with the axis's unit when it names one. */
export function valueLabel(scale, value) {
    const rounded = Math.round(value * 10) / 10;
    const unit = scale?.options?.title?.text;
    return unit ? `${rounded} ${unit}` : String(rounded);
}

/** Every drawn item in a slot, as Chart.js wants them for active elements. */
function elementsAt(chart, index) {
    return chart.data.datasets.flatMap((dataset, datasetIndex) => (
        dataset.data?.[index] != null && chart.isDatasetVisible(datasetIndex) ? [{ datasetIndex, index }] : []
    ));
}

function showSlot(chart, index, position) {
    const elements = index == null ? [] : elementsAt(chart, index);
    chart.setActiveElements(elements);
    chart.tooltip?.setActiveElements(elements, position);
}

function peersOf(group, chart) {
    return group ? group.charts().filter((other) => other !== chart && !inSetGoalMode(other)) : [];
}

function setHover(chart, patch) {
    const next = { ...chart.$alignedHover, ...patch };
    const changed = chart.$alignedHover?.index !== next.index || chart.$alignedHover?.plotY !== next.plotY;
    chart.$alignedHover = next;
    return changed;
}

function clear(chart) {
    if (!chart.$alignedHover) return;
    delete chart.$alignedHover;
    delete chart.canvas?.dataset.alignedHover;
    if (chart.$alignedEdges) showSlot(chart, null, { x: 0, y: 0 });
    chart.render();
}

function follow(source, event) {
    const area = source.chartArea;
    const inside = event.x >= area.left && event.x <= area.right && event.y >= area.top && event.y <= area.bottom;
    const stacked = peersOf(source.$alignedEdges, source);
    const beside = peersOf(source.$alignedRows, source);
    if (!inside) {
        [source, ...stacked, ...beside].forEach(clear);
        return false;
    }

    if (source.$alignedEdges) {
        const index = slotAt(source.scales.x, event.x, source.data.labels?.length || 0);
        setHover(source, { index });
        showSlot(source, index, { x: event.x, y: event.y });
        stacked.forEach((chart) => {
            if (!setHover(chart, { index })) return;
            const x = index == null ? 0 : chart.scales.x.getPixelForValue(index);
            showSlot(chart, index, { x, y: (chart.chartArea.top + chart.chartArea.bottom) / 2 });
            chart.render();
        });
        source.canvas.dataset.alignedHover = String(index);
        stacked.forEach((chart) => { chart.canvas.dataset.alignedHover = String(index); });
    }
    if (source.$alignedRows) {
        // Plots beside each other share a height, so the same distance down is the same value.
        const plotY = event.y - area.top;
        setHover(source, { plotY });
        beside.forEach((chart) => {
            if (setHover(chart, { plotY })) chart.render();
        });
    }
    return true;
}

function dashedLine(ctx, color, x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function badge(ctx, text, x, y, align, { background, foreground }) {
    ctx.save();
    ctx.font = '11px sans-serif';
    const width = ctx.measureText(text).width + 12;
    const height = 18;
    const left = align === 'center' ? x - width / 2 : x - width;
    const top = align === 'center' ? y : y - height / 2;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(Math.max(0, left), top, width, height, 4);
    ctx.fill();
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.max(0, left) + width / 2, top + height / 2);
    ctx.restore();
}

const alignedCrosshair = {
    id: 'alignedCrosshair',
    afterEvent(chart, args) {
        if ((!chart.$alignedEdges && !chart.$alignedRows) || inSetGoalMode(chart)) return;
        const { event } = args;
        if (event.type === 'mouseout') {
            [chart, ...peersOf(chart.$alignedEdges, chart), ...peersOf(chart.$alignedRows, chart)].forEach(clear);
            return;
        }
        if (event.type === 'mousemove' && follow(chart, event)) args.changed = true;
    },
    afterDatasetsDraw(chart) {
        const hover = chart.$alignedHover;
        if (!hover || inSetGoalMode(chart)) return;
        const { ctx, chartArea: area } = chart;
        const yScale = primaryYScale(chart);
        const color = chart.scales.x?.options?.ticks?.color || '#94a3b8';
        const colors = { background: color, foreground: getComputedStyle(chart.canvas).getPropertyValue('--color-bg-surface') || '#fff' };
        if (hover.index != null && chart.$alignedEdges) {
            const x = chart.scales.x.getPixelForValue(hover.index);
            dashedLine(ctx, color, x, area.top, x, area.bottom);
            badge(ctx, String(chart.data.labels[hover.index]), x, area.bottom + 4, 'center', colors);
        }
        if (hover.plotY != null && chart.$alignedRows && yScale) {
            const y = area.top + hover.plotY;
            dashedLine(ctx, color, area.left, y, area.right, y);
            badge(ctx, valueLabel(yScale, yScale.getValueForPixel(y)), area.left - 4, y, 'end', colors);
        }
    },
};

export default alignedCrosshair;
