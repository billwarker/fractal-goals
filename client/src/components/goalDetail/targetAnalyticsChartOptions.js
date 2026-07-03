const DEFAULT_SERIES_PALETTE = ['#3b82f6', '#22c55e'];

export function themedTooltipOptions(chartTheme) {
    return {
        backgroundColor: chartTheme.tooltipBg,
        titleColor: chartTheme.tooltipText,
        bodyColor: chartTheme.tooltipBody,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 6,
    };
}

export function thresholdLineAnnotations(
    metricDefs,
    conditionByMetric,
    chartTheme,
    seriesPalette = DEFAULT_SERIES_PALETTE
) {
    const annotations = {};
    metricDefs.forEach((metricDef, index) => {
        const condition = conditionByMetric.get(metricDef.id);
        if (!condition || condition.target_value == null) return;
        annotations[`threshold-${metricDef.id}`] = {
            type: 'line',
            yMin: condition.target_value,
            yMax: condition.target_value,
            yScaleID: `metric${index + 1}`,
            borderColor: seriesPalette[index],
            borderWidth: 2,
            borderDash: [6, 4],
            borderDashOffset: index * 5,
            label: {
                display: true,
                content: `Target ${condition.operator} ${condition.target_value}`,
                position: index === 0 ? 'start' : 'end',
                xAdjust: index === 0 ? 10 : -10,
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                color: seriesPalette[index],
                font: { size: 10 },
            },
        };
    });
    return annotations;
}
