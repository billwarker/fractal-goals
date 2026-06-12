import React from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { DISABLED_CHART_ANIMATION } from '../analytics/ChartJSWrapper';
import styles from './LandingFeaturesSection.module.css';

export default function LandingFeatureAnalytics({ charts }) {
    if (!charts.length) {
        return <div className={styles.emptyState}>Publish sessions with history to preview analytics.</div>;
    }

    return (
        <div className={styles.analyticsStage}>
            <p className={styles.previewEyebrow}>Published analytics view</p>
            <div className={styles.analyticsGrid}>
                {charts.map((chart) => {
                    const options = {
                        responsive: true,
                        maintainAspectRatio: false,
                        ...DISABLED_CHART_ANIMATION,
                        ...(chart.options || {}),
                    };
                    const ChartComponent = chart.type === 'line' ? Line : Bar;
                    return (
                        <article className={styles.chartCard} key={chart.id || chart.title}>
                            <h4>{chart.title || 'Progress chart'}</h4>
                            <div className={styles.chartBox}>
                                <ChartComponent data={chart.data} options={options} />
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
