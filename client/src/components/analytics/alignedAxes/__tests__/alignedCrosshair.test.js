import { describe, expect, it, vi } from 'vitest';

import alignedCrosshair, { slotAt, valueLabel } from '../alignedCrosshair';
import { createEdgeGroup } from '../edgeGroup';

const xScale = { getValueForPixel: (pixel) => pixel / 100, getPixelForValue: (index) => index * 100 };
const chartWith = (data) => ({
    canvas: { dataset: {} },
    chartArea: { left: 0, right: 400, top: 0, bottom: 200 },
    scales: { x: xScale },
    data: { labels: ['a', 'b', 'c', 'd'], datasets: [{ data }] },
    isDatasetVisible: () => true,
    setActiveElements: vi.fn(),
    tooltip: { setActiveElements: vi.fn() },
    render: vi.fn(),
    update: vi.fn(),
});
const move = (chart, x, y = 50) => {
    const args = { event: { type: 'mousemove', x, y } };
    alignedCrosshair.afterEvent(chart, args);
    return args;
};
const stackedPair = () => {
    const edges = createEdgeGroup();
    const [source, peer] = [chartWith([1, 2, 3, 4]), chartWith([null, 5, 6, 7])];
    edges.report(source, { left: 0, right: 400 });
    edges.report(peer, { left: 0, right: 400 });
    source.$alignedEdges = edges;
    peer.$alignedEdges = edges;
    return { source, peer };
};

describe('alignedCrosshair', () => {
    it('finds the slot under a pixel, and none off the axis', () => {
        expect(slotAt(xScale, 140, 4)).toBe(1);
        expect(slotAt(xScale, 900, 4)).toBeNull();
    });

    it('labels a value with its axis unit', () => {
        expect(valueLabel({ options: { title: { text: 'Lbs' } } }, 61.26)).toBe('61.3 Lbs');
        expect(valueLabel({ options: {} }, 4)).toBe('4');
    });

    it('moves stacked charts to the same slot, each showing its own tooltip', () => {
        const { source, peer } = stackedPair();
        expect(move(source, 210).changed).toBe(true);
        expect(peer.$alignedHover.index).toBe(2);
        expect(peer.tooltip.setActiveElements.mock.lastCall[0]).toEqual([{ datasetIndex: 0, index: 2 }]);
        expect(peer.render).toHaveBeenCalledTimes(1);
    });

    it('keeps the line on a slot the other chart has nothing in, with no tooltip', () => {
        const { source, peer } = stackedPair();
        move(source, 10);
        expect(peer.$alignedHover.index).toBe(0);
        expect(peer.tooltip.setActiveElements.mock.lastCall[0]).toEqual([]);
    });

    it('only redraws the other chart when the slot changes', () => {
        const { source, peer } = stackedPair();
        move(source, 210);
        move(source, 220);
        expect(peer.render).toHaveBeenCalledTimes(1);
    });

    it('clears everywhere when the pointer leaves', () => {
        const { source, peer } = stackedPair();
        move(source, 210);
        alignedCrosshair.afterEvent(source, { event: { type: 'mouseout' } });
        expect(source.$alignedHover).toBeUndefined();
        expect(peer.$alignedHover).toBeUndefined();
    });

    it('shares a height, not a slot, between side-by-side charts', () => {
        const rows = createEdgeGroup('$alignedRows');
        const [source, peer] = [chartWith([1]), chartWith([2])];
        rows.report(source, { left: 0, right: 200 });
        rows.report(peer, { left: 0, right: 200 });
        source.$alignedRows = rows;
        peer.$alignedRows = rows;
        move(source, 100, 75);
        expect(peer.$alignedHover).toEqual({ plotY: 75 });
        expect(peer.tooltip.setActiveElements).not.toHaveBeenCalled();
    });

    it('stays out of Set goal mode', () => {
        const { source, peer } = stackedPair();
        source.$axisExtension = {};
        move(source, 210);
        expect(peer.$alignedHover).toBeUndefined();

        delete source.$axisExtension;
        peer.$axisExtension = {};
        move(source, 210);
        expect(peer.$alignedHover).toBeUndefined();
        expect(source.$alignedHover.index).toBe(2);
    });
});
