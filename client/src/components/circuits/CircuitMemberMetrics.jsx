import React, { useEffect, useMemo, useRef, useState } from 'react';

import { resolveEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { isMetricValueEmpty, normalizeMetricValueForStorage } from '../../utils/sessionActivityMetrics';
import ProgressHint from '../common/ProgressHint';
import MetricCascadeButton from '../common/MetricCascadeButton';
import MetricValueEditor from '../sessionDetail/MetricValueEditor';
import activityStyles from '../sessionDetail/SessionActivityItem.module.css';
import styles from './CircuitRunCard.module.css';


const metricKey = (metricId, splitId = null) => `${metricId}:${splitId || ''}`;
const resolveMetricId = (metric) => metric?.metric_id || metric?.metric_definition_id || null;
const resolveSplitId = (metric) => metric?.split_id || metric?.split_definition_id || null;
const EMPTY_METRICS = [];

export default function CircuitMemberMetrics({
    memberId,
    rootId,
    definition,
    metrics = EMPTY_METRICS,
    disabled,
    saving,
    progress,
    onSave,
    canCascade,
    onCascade,
}) {
    const { progressSettings } = useRootProgressSettings(rootId);
    const draftsRef = useRef({});
    const [localMetrics, setLocalMetrics] = useState(metrics);
    const localMetricsRef = useRef(metrics);
    const [error, setError] = useState('');
    useEffect(() => {
        localMetricsRef.current = metrics;
        setLocalMetrics(metrics);
    }, [metrics]);

    const { metricDefinitions, splits } = useMemo(() => {
        const activeMetrics = (definition?.metric_definitions || []).filter((metric) => metric.is_active !== false);
        return {
            metricDefinitions: activeMetrics,
            splits: definition?.has_splits ? (definition.split_definitions || []) : [],
        };
    }, [definition]);

    if (metricDefinitions.length === 0) return null;

    const valueFor = (metricId, splitId = null) => {
        const key = metricKey(metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(draftsRef.current, key)) return draftsRef.current[key];
        return localMetrics.find((metric) => (
            resolveMetricId(metric) === metricId
            && (splitId ? resolveSplitId(metric) === splitId : !resolveSplitId(metric))
        ))?.value ?? '';
    };

    const commit = (metric, splitId, rawValue) => {
        const key = metricKey(metric.id, splitId);
        const normalized = normalizeMetricValueForStorage(metric, rawValue);
        if (normalized == null || (normalized !== '' && !Number.isFinite(Number(normalized)))) {
            setError(`Enter a valid value for ${metric.name}.`);
            return false;
        }
        setError('');
        const retained = localMetricsRef.current.filter((entry) => !(
            resolveMetricId(entry) === metric.id
            && (splitId ? resolveSplitId(entry) === splitId : !resolveSplitId(entry))
        ));
        const nextMetrics = normalized === '' ? retained : [
            ...retained,
            {
                metric_id: metric.id,
                ...(splitId ? { split_id: splitId } : {}),
                value: Number(normalized),
            },
        ];
        localMetricsRef.current = nextMetrics;
        setLocalMetrics(nextMetrics);
        const save = async () => {
            try {
                const saved = await onSave(nextMetrics);
                if (saved === false) throw new Error('Unable to save metrics.');
                delete draftsRef.current[key];
            } catch (requestError) {
                localMetricsRef.current = metrics;
                setLocalMetrics(metrics);
                setError(requestError?.response?.data?.error || requestError.message || 'Unable to save metrics.');
            }
        };
        void save();
        return true;
    };

    const renderMetric = (metric, split = null) => {
        const key = metricKey(metric.id, split?.id);
        const inputId = `circuit-metric-${memberId}-${key}`;
        const isSplitMetric = Boolean(split);
        const currentValue = valueFor(metric.id, split?.id);
        const showCascade = !disabled
            && !saving
            && !isMetricValueEmpty(currentValue)
            && canCascade?.(metric.id, split?.id || null);
        return (
            <div key={key} className={activityStyles.metricInputContainer}>
                <label
                    className={isSplitMetric ? activityStyles.metricLabel : activityStyles.metricLabelLarge}
                    htmlFor={inputId}
                >
                    {metric.name}
                </label>
                <div className={styles.memberMetricControl}>
                    <MetricValueEditor
                        metricDef={metric}
                        value={currentValue}
                        isDraft={Object.prototype.hasOwnProperty.call(draftsRef.current, key)}
                        inputClassName={`${activityStyles.metricInput} ${isSplitMetric ? activityStyles.metricInputSmall : activityStyles.metricInputLarge}`}
                        metaClassName={isSplitMetric ? activityStyles.metricMeta : activityStyles.metricMetaLarge}
                        unitClassName={isSplitMetric ? activityStyles.metricUnit : activityStyles.metricUnitLarge}
                        progress={(
                            <ProgressHint
                                metricId={metric.id}
                                setIndex={progress?.setIndex}
                                progressComparison={progress?.comparison}
                                displayMode={resolveEffectiveDeltaDisplayMode(definition, progressSettings)}
                            />
                        )}
                        disabled={disabled || saving}
                        inputId={inputId}
                        onDraftChange={(value) => {
                            draftsRef.current[key] = value;
                        }}
                        onCommit={(value) => commit(metric, split?.id || null, value)}
                    />
                    {showCascade && (
                        <MetricCascadeButton
                            value={currentValue}
                            unit={metric.unit}
                            destinationLabel="rounds"
                            onClick={() => onCascade(metric.id, split?.id || null)}
                        />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={`${activityStyles.setRow} ${styles.memberMetrics}`} aria-label={`${definition.name} metrics`}>
            <div className={`${activityStyles.setMetricsContent} ${styles.memberMetricsContent}`}>
                {splits.length > 0
                    ? splits.map((split) => (
                        <div key={split.id} className={activityStyles.splitContainer}>
                            <span className={activityStyles.splitLabel}>{split.name}</span>
                            {metricDefinitions.map((metric) => renderMetric(metric, split))}
                        </div>
                    ))
                    : metricDefinitions.map((metric) => renderMetric(metric))}
                {error && <p className={styles.memberMetricError} role="alert">{error}</p>}
            </div>
        </div>
    );
}
