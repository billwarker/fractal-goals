import { useEffect } from 'react';

/**
 * Shows chart points as active, as if the pointer were on them, for a selection made elsewhere
 * (e.g. a session hovered in a list). `elements` are Chart.js `{ datasetIndex, index }` pairs;
 * an empty list clears it. `tooltip` also opens the tooltip on them (off for compact charts).
 */
export default function useActiveChartPoint(chartRef, elements, { tooltip = true } = {}) {
    const key = (elements || []).map((element) => `${element.datasetIndex}:${element.index}`).join(',');
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart?.setActiveElements) return;
        const active = key ? key.split(',').map((pair) => {
            const [datasetIndex, index] = pair.split(':').map(Number);
            return { datasetIndex, index };
        }) : [];
        chart.setActiveElements(active);
        if (tooltip) chart.tooltip?.setActiveElements(active, { x: 0, y: 0 });
        chart.update('none');
    }, [chartRef, key, tooltip]);
}
