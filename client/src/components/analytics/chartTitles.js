import { isConfiguredWindowState } from './dashboardState';
import { getVisualization } from './visualizations/registry';

/** A renamed chart shows its own name; otherwise the visualization's. */
export function getChartTitle(windowState) {
    const custom = typeof windowState?.chartTitle === 'string' ? windowState.chartTitle.trim() : '';
    if (custom) return custom;
    return getVisualization(windowState?.selectedCategory, windowState?.selectedVisualization)?.name
        || windowState?.selectedVisualization
        || '';
}

/** Charts are numbered in panel order, counting only panels that show a chart, so the pane and sidebar agree. */
export function getChartNumbers(windowStates) {
    let next = 0;
    return Object.fromEntries(
        Object.entries(windowStates || {})
            .filter(([, state]) => isConfiguredWindowState(state))
            .map(([id]) => [id, ++next])
    );
}
