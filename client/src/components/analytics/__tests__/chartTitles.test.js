import { getChartNumbers, getChartTitle } from '../chartTitles';

describe('chartTitles', () => {
    it('prefers a custom name and falls back to the visualization name', () => {
        const state = { selectedCategory: 'activities', selectedVisualization: 'activityFrequency' };
        expect(getChartTitle({ ...state, chartTitle: ' Mine ' })).toBe('Mine');
        expect(getChartTitle({ ...state, chartTitle: '   ' })).toBe(getChartTitle(state));
        expect(getChartTitle(state)).not.toBe('');
    });

    it('numbers only panels that show a chart, in panel order', () => {
        const chart = { selectedCategory: 'activities', selectedVisualization: 'activityFrequency' };
        expect(getChartNumbers({ a: chart, empty: { selectedCategory: 'goals' }, b: chart })).toEqual({ a: 1, b: 2 });
    });
});
