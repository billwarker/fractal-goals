import { isConfiguredWindowState } from './dashboardState';

/** Charts are numbered in panel order, counting only panels that show a chart, so the pane and sidebar agree. */
export function getChartNumbers(windowStates) {
    let next = 0;
    return Object.fromEntries(
        Object.entries(windowStates || {})
            .filter(([, state]) => isConfiguredWindowState(state))
            .map(([id]) => [id, ++next])
    );
}
