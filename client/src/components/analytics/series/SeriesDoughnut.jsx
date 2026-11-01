import React, { useMemo, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';

import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../ChartJSWrapper';
import { ChartEmpty } from '../ChartStates';
import { buildSeries, seriesColor } from './buildSeries';
import ChartLegendPanel from './ChartLegendPanel';
import styles from './SeriesDoughnut.module.css';

/**
 * A part-of-whole doughnut under the same series rules as every multi-series chart: the validated
 * palette in a stable order (slices sorted by name, so a filter never repaints the others), at most
 * eight slices with the rest in "Other", and the legend panel for totals, hiding and isolating.
 *
 * @param {{ rows: Array<{ key: string, label: string, value: number }>, formatValue: (value: number) => string,
 *   chartRef?: any, title: string, emptyDescription: string }} props
 */
export default function SeriesDoughnut({ rows, formatValue, chartRef, title, emptyDescription }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
    const [hoverKey, setHoverKey] = useState(null);

    const { series } = useMemo(() => {
        const entities = [...rows]
            .sort((left, right) => left.label.localeCompare(right.label))
            .map((row) => ({ key: row.key, label: row.label }));
        return buildSeries({
            entities,
            rows: rows.map((row) => ({ key: row.key, bucket: 'all', value: row.value })),
            buckets: ['all'],
        });
    }, [rows]);
    const shown = series.filter((item) => !hiddenKeys.has(item.key));
    const colorOf = (item) => seriesColor(item, chartTheme);

    if (!series.length) return <ChartEmpty description={emptyDescription} />;
    const compact = density === 'compact';
    return (
        <div className={styles.root}>
        <div className={compact ? styles.bodyCompact : styles.body}>
            <div className={styles.chart}>
                <Doughnut
                    ref={chartRef}
                    aria-label={title}
                    data={{
                        labels: shown.map((item) => item.label),
                        datasets: [{
                            data: shown.map((item) => item.total),
                            backgroundColor: shown.map((item) => (
                                hoverKey && hoverKey !== item.key ? `${colorOf(item)}33` : colorOf(item)
                            )),
                            borderWidth: 0,
                            spacing: 2,
                        }],
                    }}
                    options={applyChartDensity({
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '62%',
                        ...DISABLED_CHART_ANIMATION,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: chartTheme.tooltipBg,
                                titleColor: chartTheme.tooltipText,
                                bodyColor: chartTheme.tooltipBody,
                                padding: 12,
                                callbacks: { label: (ctx) => `${ctx.label}: ${formatValue(ctx.raw)}` },
                            },
                        },
                    }, density)}
                />
            </div>
            <ChartLegendPanel
                series={series}
                colorOf={colorOf}
                formatValue={formatValue}
                hiddenKeys={hiddenKeys}
                onHiddenKeysChange={setHiddenKeys}
                onHoverKeyChange={setHoverKey}
                compact={compact}
                title={title}
            />
        </div>
        </div>
    );
}
