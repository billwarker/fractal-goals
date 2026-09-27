// Pure helpers for planned values ("prescriptions") on template and plan items.
// Shape: { schema: 1, notes?, metrics?: Entry[], sets?: { metrics: Entry[], notes? }[] }
// where Entry = { metric_id, split_id, value }. The server re-validates everything.

export const PRESCRIPTION_SCHEMA_VERSION = 1;
export const MAX_PRESCRIPTION_SETS = 50;

/**
 * @typedef {{ metric_id: string, split_id: string | null, value: number }} PrescriptionEntry
 * @typedef {{ metrics: PrescriptionEntry[], notes?: string | null }} PrescriptionSet
 * @typedef {{ schema: number, notes?: string | null, metrics?: PrescriptionEntry[], sets?: PrescriptionSet[] }} Prescription
 */

export function getActiveMetricDefinitions(definition) {
    return (definition?.metric_definitions || []).filter((metric) => metric.is_active !== false);
}

export function getActiveSplitDefinitions(definition) {
    if (!definition?.has_splits) return [];
    return [...(definition?.split_definitions || [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

/** One column per metric, or per split × metric for split activities. */
export function getPrescriptionColumns(definition) {
    const metrics = getActiveMetricDefinitions(definition);
    const splits = getActiveSplitDefinitions(definition);
    if (splits.length === 0) {
        return metrics.map((metric) => ({ key: metric.id, metric, split: null }));
    }
    return splits.flatMap((split) => metrics.map((metric) => ({
        key: `${split.id}:${metric.id}`,
        metric,
        split,
    })));
}

export function getEntryValue(entries, metricId, splitId = null) {
    const entry = (entries || []).find((candidate) => (
        candidate.metric_id === metricId && (candidate.split_id ?? null) === (splitId ?? null)
    ));
    return entry ? entry.value : null;
}

export function setEntryValue(entries, metricId, splitId, value) {
    const remaining = (entries || []).filter((candidate) => !(
        candidate.metric_id === metricId && (candidate.split_id ?? null) === (splitId ?? null)
    ));
    if (value === '' || value == null || !Number.isFinite(Number(value))) return remaining;
    return [...remaining, { metric_id: metricId, split_id: splitId ?? null, value: Number(value) }];
}

function cleanNote(note) {
    const trimmed = typeof note === 'string' ? note.trim() : '';
    return trimmed || null;
}

/** Drop empty parts; return null when nothing is planned. */
export function normalizePrescription(prescription) {
    if (!prescription) return null;
    const notes = cleanNote(prescription.notes);
    const sets = (prescription.sets || []).map((plannedSet) => ({
        metrics: plannedSet.metrics || [],
        notes: cleanNote(plannedSet.notes),
    }));
    const metrics = prescription.metrics || [];
    if (!notes && sets.length === 0 && metrics.length === 0) return null;
    return {
        schema: PRESCRIPTION_SCHEMA_VERSION,
        ...(notes ? { notes } : {}),
        ...(sets.length > 0 ? { sets } : {}),
        ...(sets.length === 0 && metrics.length > 0 ? { metrics } : {}),
    };
}

export function withPrescriptionNotes(prescription, notes) {
    return normalizePrescription({ ...(prescription || {}), notes });
}

export function withSetValue(prescription, setIndex, metricId, splitId, value) {
    const sets = [...(prescription?.sets || [])];
    const current = sets[setIndex] || { metrics: [] };
    sets[setIndex] = { ...current, metrics: setEntryValue(current.metrics, metricId, splitId, value) };
    return normalizePrescription({ ...(prescription || {}), sets });
}

export function withSetNotes(prescription, setIndex, notes) {
    const sets = [...(prescription?.sets || [])];
    sets[setIndex] = { ...(sets[setIndex] || { metrics: [] }), notes };
    return normalizePrescription({ ...(prescription || {}), sets });
}

export function withFlatValue(prescription, metricId, splitId, value) {
    return normalizePrescription({
        ...(prescription || {}),
        metrics: setEntryValue(prescription?.metrics, metricId, splitId, value),
    });
}

/** Append a set that repeats the last planned set's values, the usual next step when programming. */
export function withAddedSet(prescription) {
    const sets = [...(prescription?.sets || [])];
    if (sets.length >= MAX_PRESCRIPTION_SETS) return prescription;
    const last = sets[sets.length - 1];
    sets.push({ metrics: last ? last.metrics.map((entry) => ({ ...entry })) : [], notes: null });
    return normalizePrescription({ ...(prescription || {}), sets });
}

export function withRemovedSet(prescription, setIndex) {
    const sets = (prescription?.sets || []).filter((_, index) => index !== setIndex);
    return normalizePrescription({ ...(prescription || {}), sets });
}

export function countPlannedValues(prescription) {
    if (!prescription) return 0;
    if (prescription.sets) return prescription.sets.length;
    return (prescription.metrics || []).length;
}

/** Short summary for collapsed rows, e.g. "3 sets" or "2 values · note". */
export function summarizePrescription(prescription) {
    if (!prescription) return '';
    const parts = [];
    if (prescription.sets?.length) {
        parts.push(`${prescription.sets.length} set${prescription.sets.length === 1 ? '' : 's'}`);
    } else if (prescription.metrics?.length) {
        parts.push(`${prescription.metrics.length} value${prescription.metrics.length === 1 ? '' : 's'}`);
    }
    if (prescription.notes || prescription.sets?.some((plannedSet) => plannedSet.notes)) parts.push('notes');
    return parts.join(' · ');
}
