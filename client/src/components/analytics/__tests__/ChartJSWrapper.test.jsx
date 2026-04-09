import { createChartOptions, DISABLED_CHART_ANIMATION } from '../ChartJSWrapper';

describe('ChartJSWrapper', () => {
    it('disables Chart.js render animations for analytics charts', () => {
        const options = createChartOptions({
            title: 'Weight Over Time',
            xAxisLabel: 'Date',
            yAxisLabel: 'Weight',
            isTimeScale: true,
        });

        expect(options.animation).toBe(false);
        expect(options.animations).toEqual(DISABLED_CHART_ANIMATION.animations);
        expect(options.transitions.active.animation.duration).toBe(0);
        expect(options.transitions.show.animations.y.duration).toBe(0);
    });
});
