import { applyChartDensity } from '../ChartJSWrapper';
import { densityForSize } from '../useContainerDensity';
import { gridShift, snappedLength } from '../pageGridSnap';
import { deleteViewMessage } from '../AnalyticsViewsModal';

describe('densityForSize', () => {
    it('is compact under 480px wide or 260px tall', () => {
        expect(densityForSize(479, 400)).toBe('compact');
        expect(densityForSize(800, 259)).toBe('compact');
        expect(densityForSize(480, 260)).toBe('full');
    });
});

describe('applyChartDensity', () => {
    const options = {
        plugins: {
            title: { display: true, text: 'Trend' },
            legend: { display: true },
            tooltip: { enabled: true },
            annotation: { annotations: { goal: { type: 'line', label: { display: true, content: '≥ 225' } } } },
        },
        scales: {
            x: { title: { display: true, text: 'Date' }, ticks: { maxRotation: 45 } },
            y: { title: { display: true, text: 'lbs' } },
        },
    };

    it('leaves full charts unchanged', () => {
        expect(applyChartDensity(options, 'full')).toBe(options);
    });

    it('draws expanded charts on the page grid: full detail and axis lines, no gridlines of their own, snapped', () => {
        const expanded = applyChartDensity(options, 'expanded');
        expect(expanded.plugins).toMatchObject({ legend: { display: true }, pageGridSnap: { enabled: true } });
        expect(expanded.scales.x).toMatchObject({ grid: { display: false }, ticks: { maxRotation: 45 } });
        expect(expanded.scales.x.border).toMatchObject({ display: true, width: 1 });
        expect(expanded.scales.y).toMatchObject({ grid: { display: false }, title: { display: true } });
        const chart = {};
        expect(expanded.layout.padding({ chart })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
        chart.$pageGridPad = { top: 7, right: 3, bottom: 11, left: 13 };
        expect(expanded.layout.padding({ chart })).toEqual(chart.$pageGridPad);
    });

    it('drops the title, legend, axis titles and reference labels, caps ticks and keeps tooltips', () => {
        const compact = applyChartDensity(options, 'compact');
        expect(compact.plugins.title.display).toBe(false);
        expect(compact.plugins.legend.display).toBe(false);
        expect(compact.plugins.tooltip.enabled).toBe(true);
        expect(compact.plugins.annotation.annotations.goal.label.display).toBe(false);
        expect(compact.scales.x).toMatchObject({ title: { display: false }, ticks: { maxTicksLimit: 4, maxRotation: 0 } });
        expect(compact.scales.y).toMatchObject({ title: { display: false }, ticks: { maxTicksLimit: 3 } });
        expect(options.plugins.legend.display).toBe(true);
    });
});

describe('deleteViewMessage', () => {
    it('names the goals a view shows on', () => {
        const view = { name: 'Bench trend' };
        expect(deleteViewMessage(view, [])).toBe('Are you sure you want to delete "Bench trend"?');
        expect(deleteViewMessage(view, [{ goal_name: 'Bench 225' }])).toContain('shown on 1 goal (Bench 225)');
        const many = ['A', 'B', 'C', 'D', 'E'].map((goal_name) => ({ goal_name }));
        expect(deleteViewMessage(view, many)).toContain('5 goals (A, B, C and 2 more)');
    });
});

describe('pageGridSnap', () => {
    it('moves an edge forward onto the next grid line', () => {
        expect(gridShift(40, 20)).toBe(0);
        expect(gridShift(53, 20)).toBe(7);
        expect(gridShift(-3, 20)).toBe(3);
    });

    it('snaps every step to whole cells when that loses little space', () => {
        // 6 ticks (5 intervals) in 1010px: 200px apart, 1000px long.
        expect(snappedLength(1010, 20, 5)).toBe(1000);
        // 7 bars with offsets centre on lines when each takes an even number of cells.
        expect(snappedLength(860, 20, 7, 40)).toBe(840);
    });

    it('fills the space in whole cells when snapping every step would shrink the chart', () => {
        // 22 dates (21 steps) in 1600px: snapping would leave 1260px, so the chart fills 1600px.
        expect(snappedLength(1600, 20, 21)).toBe(1600);
        expect(snappedLength(310, 20, 40)).toBe(300);
    });
});
