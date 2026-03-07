import React from 'react';

import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import Input from '../atoms/Input';
import styles from '../ActivityBuilder.module.css';

function ActivityMetricsSection({
    metrics,
    hasSets,
    metricsMultiplicative,
    onAddMetric,
    onRemoveMetric,
    onMetricChange,
}) {
    return (
        <div>
            <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Metrics (Max 3)
            </label>
            <div className={styles.metricsList}>
                {metrics.map((metric, idx) => (
                    <div key={idx} className={styles.metricCard}>
                        <div className={styles.metricRow}>
                            <Input
                                value={metric.name}
                                onChange={(event) => onMetricChange(idx, 'name', event.target.value)}
                                placeholder="Metric Name (e.g. Speed)"
                                style={{ marginBottom: 0, flex: 1 }}
                            />
                            <Input
                                value={metric.unit}
                                onChange={(event) => onMetricChange(idx, 'unit', event.target.value)}
                                placeholder="Unit (e.g. bpm)"
                                style={{ marginBottom: 0, width: '120px' }}
                            />
                            {metrics.length > 1 && (
                                <Button
                                    type="button"
                                    onClick={() => onRemoveMetric(idx)}
                                    variant="ghost"
                                    style={{ color: 'var(--color-brand-danger)', padding: '8px' }}
                                >
                                    ×
                                </Button>
                            )}
                        </div>

                        <div className={styles.metricFlags}>
                            {hasSets && (
                                <Checkbox
                                    label="Top Set Metric"
                                    checked={metric.is_top_set_metric || false}
                                    onChange={(event) => onMetricChange(idx, 'is_top_set_metric', event.target.checked)}
                                    className={styles.subFlagLabel}
                                />
                            )}
                            {metricsMultiplicative && (
                                <Checkbox
                                    label="Multiplicative"
                                    checked={metric.is_multiplicative !== undefined ? metric.is_multiplicative : true}
                                    onChange={(event) => onMetricChange(idx, 'is_multiplicative', event.target.checked)}
                                    className={styles.subFlagLabel}
                                />
                            )}
                        </div>
                    </div>
                ))}
                {metrics.length < 3 && (
                    <Button
                        type="button"
                        onClick={onAddMetric}
                        variant="secondary"
                        size="sm"
                        style={{ alignSelf: 'flex-start' }}
                    >
                        + Add Metric
                    </Button>
                )}
            </div>
        </div>
    );
}

export default ActivityMetricsSection;
