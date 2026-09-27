// Reads the planned values snapshotted onto an activity instance (`instance.prescription`)
// and compares them with what was logged. Plans are reference-only: nothing here writes
// session results.

import { getEntryValue } from './prescriptionModel';
import { formatMetricValueForInput, getMetricPrecision } from './sessionActivityMetrics';

export const PLAN_STATE_PENDING = 'pending';
export const PLAN_STATE_MET = 'met';
export const PLAN_STATE_UNDER = 'under';

/**
 * Planned value for one metric, or null when the plan does not cover it.
 * Set activities read the planned set at `setIndex`; sets beyond the plan have no value.
 */
export function getPlannedValue(prescription, metricId, { setIndex = null, splitId = null } = {}) {
    if (!prescription || !metricId) return null;
    if (setIndex != null) {
        const plannedSet = prescription.sets?.[setIndex];
        return plannedSet ? getEntryValue(plannedSet.metrics, metricId, splitId) : null;
    }
    return getEntryValue(prescription.metrics, metricId, splitId);
}

/** Planned value for chips and placeholders: the metric's precision without padding zeros. */
export function formatPlannedValue(metricDef, value) {
    if (value == null) return '';
    if (metricDef?.input_type === 'duration') return formatMetricValueForInput(metricDef, value);
    return String(Number(Number(value).toFixed(getMetricPrecision(metricDef))));
}

export function getPlannedSetNote(prescription, setIndex) {
    return prescription?.sets?.[setIndex]?.notes || null;
}

export function prescriptionPlansValues(prescription) {
    if (!prescription) return false;
    return Boolean(
        prescription.metrics?.length
        || prescription.sets?.some((plannedSet) => plannedSet.metrics?.length),
    );
}

/**
 * Compare an entered value with its plan. `higherIsBetter === false` means lower
 * values meet the plan (e.g. a timed run); anything else treats higher as better,
 * matching the progress comparisons.
 */
export function evaluatePlannedMetric({ planned, actual, higherIsBetter }) {
    if (planned == null) return null;
    if (actual == null || String(actual).trim() === '') return PLAN_STATE_PENDING;
    const actualNumber = Number(actual);
    if (!Number.isFinite(actualNumber)) return PLAN_STATE_PENDING;
    const met = higherIsBetter === false ? actualNumber <= planned : actualNumber >= planned;
    return met ? PLAN_STATE_MET : PLAN_STATE_UNDER;
}
