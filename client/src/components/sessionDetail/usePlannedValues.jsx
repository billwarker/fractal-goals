import React, { useCallback, useMemo } from 'react';

import {
    evaluatePlannedMetric,
    formatPlannedValue,
    getPlannedSetNote,
    getPlannedValue,
} from '../../utils/sessionPrescription';
import PlannedValueChip from './PlannedValueChip';

/**
 * Planned-value helpers for one activity instance. Everything reads the
 * prescription snapshotted onto the instance at session creation.
 */
export default function usePlannedValues({ exercise, metricDefinitions, getMetricValue }) {
    const prescription = exercise?.prescription || null;
    const loggedSets = exercise?.sets;
    const loggedMetrics = exercise?.metrics;
    const metricById = useMemo(
        () => new Map((metricDefinitions || []).map((metric) => [metric.id, metric])),
        [metricDefinitions],
    );

    const renderPlannedValue = useCallback((metricId, { setIndex = null, splitId = null } = {}) => {
        if (!prescription) return null;
        const planned = getPlannedValue(prescription, metricId, { setIndex, splitId });
        if (planned == null) return null;
        const metric = metricById.get(metricId);
        const entries = setIndex != null ? loggedSets?.[setIndex]?.metrics : loggedMetrics;
        const state = evaluatePlannedMetric({
            planned,
            actual: getMetricValue(entries, metricId, splitId),
            higherIsBetter: metric?.higher_is_better,
        });
        return (
            <PlannedValueChip
                label={formatPlannedValue(metric, planned)}
                state={state}
            />
        );
    }, [getMetricValue, loggedMetrics, loggedSets, metricById, prescription]);

    const getSetPlanNote = useCallback(
        (setIndex) => getPlannedSetNote(prescription, setIndex),
        [prescription],
    );

    return {
        activityPlanNote: prescription?.notes || null,
        getSetPlanNote,
        renderPlannedValue,
    };
}
