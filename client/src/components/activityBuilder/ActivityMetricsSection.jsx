import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { useFractalMetrics, useCreateFractalMetric } from '../../hooks/useActivityQueries';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import CloseIcon from '../atoms/CloseIcon';
import Input from '../atoms/Input';
import Select from '../atoms/Select';
import styles from '../ActivityBuilder.module.css';
import metricStyles from './ActivityMetricsSection.module.css';

function InlineMetricCreator({ rootId, onCreated, onCancel }) {
    const createMutation = useCreateFractalMetric(rootId);
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('');
    const [inputType, setInputType] = useState('number');
    const [isMultiplicative, setIsMultiplicative] = useState(true);
    const [isAdditive, setIsAdditive] = useState(true);
    const [higherIsBetter, setHigherIsBetter] = useState(true);

    const handleCreate = async () => {
        if (!name.trim() || !unit.trim() || createMutation.isPending) return;
        try {
            const res = await createMutation.mutateAsync({
                name: name.trim(),
                unit: unit.trim(),
                input_type: inputType,
                is_multiplicative: isMultiplicative,
                is_additive: isAdditive,
                higher_is_better: higherIsBetter,
            });
            onCreated(res.data);
            setName('');
            setUnit('');
            setInputType('number');
            setIsMultiplicative(true);
            setIsAdditive(true);
            setHigherIsBetter(true);
        } catch (err) {
            notify.error(`Failed to create metric: ${formatError(err)}`);
        }
    };

    return (
        <div
            className={metricStyles.inlineCreator}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target.matches('input[type="text"]')) {
                    event.preventDefault();
                    handleCreate();
                }
            }}
        >
            <div className={metricStyles.inlineCreatorControls}>
                <Input
                    label="Metric name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Reps"
                    className={metricStyles.compactField}
                    fullWidth
                />
                <Input
                    label="Unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. reps"
                    className={metricStyles.compactField}
                    fullWidth
                />
                <Select
                    label="Data type"
                    value={inputType}
                    onChange={(event) => setInputType(event.target.value)}
                    className={metricStyles.compactField}
                    fullWidth
                >
                    <option value="integer">Integer</option>
                    <option value="number">Decimal</option>
                    <option value="duration">Duration</option>
                </Select>
                <div className={metricStyles.inlineCreatorOptions} aria-label="Metric behavior">
                    <Checkbox
                        label="Multiplicative"
                        checked={isMultiplicative}
                        onChange={(event) => setIsMultiplicative(event.target.checked)}
                    />
                    <Checkbox
                        label="Additive"
                        checked={isAdditive}
                        onChange={(event) => setIsAdditive(event.target.checked)}
                    />
                    <Checkbox
                        label="Higher is better"
                        checked={higherIsBetter}
                        onChange={(event) => setHigherIsBetter(event.target.checked)}
                    />
                </div>
            </div>
            <div className={metricStyles.inlineCreatorActions}>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onCancel}
                    disabled={createMutation.isPending}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={handleCreate}
                    disabled={!name.trim() || !unit.trim() || createMutation.isPending}
                    isLoading={createMutation.isPending}
                >
                    Create Metric
                </Button>
            </div>
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
    const [creatorMetricIndex, setCreatorMetricIndex] = useState(null);

    const handleSelectMetric = (idx, fractalMetricId) => {
        if (fractalMetricId === '__create__') {
            setCreatorMetricIndex(idx);
            return;
        }
        if (creatorMetricIndex === idx) setCreatorMetricIndex(null);
        const selected = fractalMetrics.find((m) => m.id === fractalMetricId);
        if (!selected) return;
        onMetricChange(idx, 'fractal_metric_id', selected.id);
        onMetricChange(idx, 'name', selected.name);
        onMetricChange(idx, 'unit', selected.unit);
        onMetricChange(idx, 'is_multiplicative', selected.is_multiplicative);
    };

    const handleCreated = (metricIndex, newMetric) => {
        setCreatorMetricIndex(null);
        onMetricChange(metricIndex, 'fractal_metric_id', newMetric.id);
        onMetricChange(metricIndex, 'name', newMetric.name);
        onMetricChange(metricIndex, 'unit', newMetric.unit);
        onMetricChange(metricIndex, 'is_multiplicative', newMetric.is_multiplicative);
    };

    return (
        <div>
            <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Metrics (Max 3)
            </label>
            <div className={styles.metricsList}>
                {metrics.map((metric, idx) => {
                    const linked = fractalMetrics.find((m) => m.id === metric.fractal_metric_id);
                    const metricTracksProgress = metric.track_progress !== false;
                    return (
                        <div key={idx} className={styles.metricCard}>
                            <div className={styles.metricRow}>
                                <select
                                    className={metricStyles.metricSelect}
                                    aria-label={`Metric ${idx + 1}`}
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
                                        aria-label="Remove metric"
                                    >
                                        <CloseIcon size={14} />
                                    </Button>
                                )}
                            </div>

                            {creatorMetricIndex === idx && (
                                <InlineMetricCreator
                                    rootId={rootId}
                                    onCreated={(newMetric) => handleCreated(idx, newMetric)}
                                    onCancel={() => setCreatorMetricIndex(null)}
                                />
                            )}

                            {linked && (
                                <div className={metricStyles.metricMeta}>
                                    {linked.is_multiplicative && <span className={metricStyles.metaBadgeMultiplicative}>Multiplicative</span>}
                                    {linked.is_additive && <span className={metricStyles.metaBadgeAdditive}>Additive</span>}
                                    {linked.higher_is_better === false
                                        ? <span className={metricStyles.metaBadge}>Lower is better</span>
                                        : <span className={metricStyles.metaBadge}>Higher is better</span>}
                                    {linked.input_type !== 'number' && <span className={metricStyles.metaBadge}>{linked.input_type}</span>}
                                    {linked.description && <span className={metricStyles.metaDesc}>{linked.description}</span>}
                                </div>
                            )}

                            <div className={metricStyles.progressTrackingSection}>
                                <div className={metricStyles.progressTrackingControls}>
                                    <div className={styles.metricFlags}>
                                        <Checkbox
                                            label="Track Progress"
                                            checked={metricTracksProgress}
                                            onChange={(e) => onMetricChange(idx, 'track_progress', e.target.checked)}
                                            className={styles.subFlagLabel}
                                        />
                                    </div>

                                    {hasSets && (
                                        <div className={styles.metricFlags}>
                                            <Checkbox
                                                label="Best Set Metric"
                                                checked={metric.is_best_set_metric || false}
                                                onChange={(e) => onMetricChange(idx, 'is_best_set_metric', e.target.checked)}
                                                className={styles.subFlagLabel}
                                            />
                                        </div>
                                    )}
                                </div>

                                {!metricTracksProgress && (
                                    <div className={metricStyles.progressTrackingPreview}>
                                        Progress comparisons disabled for this metric
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

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

ActivityMetricsSection.propTypes = {
    rootId: PropTypes.string.isRequired,
    metrics: PropTypes.array.isRequired,
    hasSets: PropTypes.bool,
    onAddMetric: PropTypes.func.isRequired,
    onRemoveMetric: PropTypes.func.isRequired,
    onMetricChange: PropTypes.func.isRequired,
};

export default ActivityMetricsSection;
