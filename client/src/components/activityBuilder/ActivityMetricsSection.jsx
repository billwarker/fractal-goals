import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { useFractalMetrics, useCreateFractalMetric } from '../../hooks/useActivityQueries';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import Input from '../atoms/Input';
import styles from '../ActivityBuilder.module.css';
import metricStyles from './ActivityMetricsSection.module.css';

function InlineMetricCreator({ rootId, onCreated }) {
    const createMutation = useCreateFractalMetric(rootId);
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('');

    const handleCreate = async () => {
        if (!name.trim() || !unit.trim()) return;
        try {
            const res = await createMutation.mutateAsync({ name: name.trim(), unit: unit.trim() });
            onCreated(res.data);
            setName('');
            setUnit('');
        } catch (err) {
            notify.error(`Failed to create metric: ${formatError(err)}`);
        }
    };

    return (
        <div className={metricStyles.inlineCreator}>
            <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Reps)"
                style={{ marginBottom: 0, flex: 1 }}
            />
            <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Unit (e.g. reps)"
                style={{ marginBottom: 0, width: '100px' }}
            />
            <Button
                type="button"
                variant="success"
                size="sm"
                onClick={handleCreate}
                disabled={!name.trim() || !unit.trim() || createMutation.isPending}
            >
                Create
            </Button>
        </div>
    );
}

function ActivityMetricsSection({
    rootId,
    metrics,
    hasSets,
    onAddMetric,
    onRemoveMetric,
    onMetricChange,
}) {
    const { fractalMetrics = [] } = useFractalMetrics(rootId);
    const [showCreator, setShowCreator] = useState(false);

    const handleSelectMetric = (idx, fractalMetricId) => {
        if (fractalMetricId === '__create__') {
            setShowCreator(true);
            return;
        }
        const selected = fractalMetrics.find((m) => m.id === fractalMetricId);
        if (!selected) return;
        onMetricChange(idx, 'fractal_metric_id', selected.id);
        onMetricChange(idx, 'name', selected.name);
        onMetricChange(idx, 'unit', selected.unit);
        onMetricChange(idx, 'is_multiplicative', selected.is_multiplicative);
    };

    const handleCreated = (newMetric) => {
        setShowCreator(false);
        // If there's a pending empty metric slot, fill it; otherwise add a new slot
        const emptyIdx = metrics.findIndex((m) => !m.fractal_metric_id && !m.name);
        if (emptyIdx >= 0) {
            onMetricChange(emptyIdx, 'fractal_metric_id', newMetric.id);
            onMetricChange(emptyIdx, 'name', newMetric.name);
            onMetricChange(emptyIdx, 'unit', newMetric.unit);
            onMetricChange(emptyIdx, 'is_multiplicative', newMetric.is_multiplicative);
        } else if (metrics.length < 3) {
            onAddMetric({ fractal_metric_id: newMetric.id, name: newMetric.name, unit: newMetric.unit, is_multiplicative: newMetric.is_multiplicative, is_top_set_metric: false });
        }
    };

    return (
        <div>
            <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Metrics (Max 3)
            </label>
            <div className={styles.metricsList}>
                {metrics.map((metric, idx) => {
                    const linked = fractalMetrics.find((m) => m.id === metric.fractal_metric_id);
                    return (
                        <div key={idx} className={styles.metricCard}>
                            <div className={styles.metricRow}>
                                <select
                                    className={metricStyles.metricSelect}
                                    value={metric.fractal_metric_id || ''}
                                    onChange={(e) => handleSelectMetric(idx, e.target.value)}
                                >
                                    <option value="">— Select a metric —</option>
                                    {fractalMetrics.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} ({m.unit})
                                        </option>
                                    ))}
                                    <option value="__create__">+ Create new metric…</option>
                                </select>
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

                            {linked && (
                                <div className={metricStyles.metricMeta}>
                                    {linked.is_multiplicative && <span className={metricStyles.metaBadgeMultiplicative}>Multiplicative</span>}
                                    {linked.is_additive && <span className={metricStyles.metaBadgeAdditive}>Additive</span>}
                                    {linked.input_type !== 'number' && <span className={metricStyles.metaBadge}>{linked.input_type}</span>}
                                    {linked.description && <span className={metricStyles.metaDesc}>{linked.description}</span>}
                                </div>
                            )}

                            <div className={styles.metricFlags}>
                                {hasSets && (
                                    <Checkbox
                                        label="Top Set Metric"
                                        checked={metric.is_top_set_metric || false}
                                        onChange={(e) => onMetricChange(idx, 'is_top_set_metric', e.target.checked)}
                                        className={styles.subFlagLabel}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}

                {showCreator && (
                    <InlineMetricCreator rootId={rootId} onCreated={handleCreated} />
                )}

                {metrics.length < 3 && !showCreator && (
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

ActivityMetricsSection.propTypes = {
    rootId: PropTypes.string.isRequired,
    metrics: PropTypes.array.isRequired,
    hasSets: PropTypes.bool,
    onAddMetric: PropTypes.func.isRequired,
    onRemoveMetric: PropTypes.func.isRequired,
    onMetricChange: PropTypes.func.isRequired,
};

export default ActivityMetricsSection;
