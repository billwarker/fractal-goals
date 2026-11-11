import { describe, expect, it, vi } from 'vitest';

import pageGridSnap, { labelOverhang } from '../pageGridSnap';

/**
 * A stand-in for Chart.js's layout (layouts.js updateMaxPadding / handleMaxPadding): each side of the plot
 * is inset by the larger of the padding plus the boxes there (a 40px y axis on the left) and the outer tick
 * labels' overhang.
 */
function fakeChart({ width = 600, height = 400, overhang }) {
    const container = document.createElement('div');
    container.setAttribute('data-page-grid', '');
    container.style.backgroundSize = '20px 20px';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);
    const chart = {
        canvas, width, height, scales: {},
        boxes: [
            { position: 'left', width: 40, getPadding: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) },
            { position: 'bottom', height: 0, getPadding: () => overhang },
        ],
        update: vi.fn(),
        layout() {
            const pad = chart.$pageGridPad || { top: 0, right: 0, bottom: 0, left: 0 };
            chart.chartArea = {
                left: Math.max(pad.left + 40, overhang.left),
                top: Math.max(pad.top, overhang.top),
                right: width - Math.max(pad.right, overhang.right),
                bottom: height - Math.max(pad.bottom, overhang.bottom),
            };
        },
    };
    return chart;
}

/** Lays the chart out the way Chart.js would, re-running whenever the plugin asks for another pass. */
function settle(chart) {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(); return 0; });
    const passes = [];
    chart.update.mockImplementation(() => {
        if (passes.length > 20) return;
        chart.layout();
        passes.push({ ...chart.$pageGridPad });
        pageGridSnap.afterLayout(chart, {}, { enabled: true });
    });
    chart.update();
    window.requestAnimationFrame.mockRestore();
    return passes;
}

describe('pageGridSnap layout', () => {
    it('reads how far the outer labels overhang on each side', () => {
        const chart = { boxes: [{ getPadding: () => ({ right: 12, left: 3 }) }, { getPadding: () => ({ right: 4, top: 6 }) }, {}] };
        expect(labelOverhang(chart)).toEqual({ top: 6, right: 12, bottom: 0, left: 3 });
    });

    it('settles when the last label overhangs the plot by more than the padding it asks for', () => {
        // "Nov 10" under the last point reaches 13px past the plot: padding below that moves nothing.
        const chart = fakeChart({ overhang: { top: 4, right: 13, bottom: 0, left: 0 } });
        const passes = settle(chart);
        expect(passes.length).toBeLessThanOrEqual(4);
        const { right } = chart.chartArea;
        expect(right % 20).toBe(0); // On a grid line, inside the room the labels leave.
        expect(right).toBeLessThanOrEqual(600 - 13);
        expect(chart.$pageGridPad.right).toBeGreaterThanOrEqual(13); // The padding it settles on is honoured.
    });

    it('still snaps a chart whose labels fit inside its padding', () => {
        const chart = fakeChart({ overhang: { top: 0, right: 0, bottom: 0, left: 0 } });
        const passes = settle(chart);
        expect(passes.length).toBeLessThanOrEqual(4);
        expect(chart.chartArea.left % 20).toBe(0);
        expect(chart.chartArea.right % 20).toBe(0);
    });
});
