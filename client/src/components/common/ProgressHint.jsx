import React from 'react';

import styles from './ProgressHint.module.css';

function formatProgressValue(comparison, displayMode) {
    if (!comparison) return null;
    if (displayMode === 'absolute') {
        if (comparison.delta == null) return null;
        const delta = Number(comparison.delta);
        const magnitude = Math.abs(delta);
        const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1).replace(/\.0$/, '');
        return delta > 0 ? `+${formatted}` : delta < 0 ? `-${formatted}` : '0';
    }
    if (comparison.pct_change != null) {
        const magnitude = Math.abs(comparison.pct_change);
        const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1).replace(/\.0$/, '');
        return comparison.improved ? `▲${formatted}%` : comparison.regressed ? `▼${formatted}%` : '0%';
    }
    if (comparison.delta == null) return null;
    const delta = Number(comparison.delta);
    const magnitude = Math.abs(delta);
    const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1).replace(/\.0$/, '');
    return delta > 0 ? `+${formatted}` : delta < 0 ? `-${formatted}` : '0';
}

export default function ProgressHint({ metricId, setIndex = null, progressComparison, displayMode = 'percent' }) {
    if (!progressComparison || progressComparison.included === false || progressComparison.is_first_instance) return null;
    const metricComparison = progressComparison.metric_comparisons?.find((item) => item.metric_id === metricId);
    if (!metricComparison) return null;

    let comparison = metricComparison;
    if (setIndex != null && Array.isArray(metricComparison.set_comparisons) && metricComparison.set_comparisons.length > 0) {
        comparison = metricComparison.set_comparisons.find((item) => item.set_index === setIndex);
        if (!comparison || comparison.previous_value == null) return null;
    }
    const value = formatProgressValue(comparison, displayMode);
    if (!value) return null;
    const tone = comparison.improved ? styles.improved : comparison.regressed ? styles.regressed : styles.neutral;
    return <span className={`${styles.hint} ${tone}`}>({value})</span>;
}
