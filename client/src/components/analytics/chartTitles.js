import { getVisualization } from './visualizations/registry';

/** A renamed chart shows its own name; otherwise the visualization's. */
export function getChartTitle(windowState) {
    const custom = typeof windowState?.chartTitle === 'string' ? windowState.chartTitle.trim() : '';
    if (custom) return custom;
    return getVisualization(windowState?.selectedCategory, windowState?.selectedVisualization)?.name
        || windowState?.selectedVisualization
        || '';
}
