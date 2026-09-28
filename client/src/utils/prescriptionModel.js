// Pure helpers for planned values ("prescriptions") on template and plan items.
// Shape: { schema: 1, notes?, tags?, metrics?: Entry[], sets?: { metrics: Entry[], notes?, tags? }[] }
// where Entry = { metric_id, split_id, value }. The server re-validates everything.

export const PRESCRIPTION_SCHEMA_VERSION = 1;
export const MAX_PRESCRIPTION_SETS = 50;

/**
 * @typedef {{ metric_id: string, split_id: string | null, value: number }} PrescriptionEntry
 * @typedef {{ metrics: PrescriptionEntry[], notes?: string | null, tags?: string[] }} PrescriptionSet
 * @typedef {{ schema: number, notes?: string | null, tags?: string[], metrics?: PrescriptionEntry[], sets?: PrescriptionSet[] }} Prescription
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

// Planned tags are activity tag binding ids, applied to the instance or set when the session starts.
function cleanTags(tags) {
    return [...new Set((tags || []).filter((tagId) => typeof tagId === 'string' && tagId))];
}

/** Drop empty parts; return null when nothing is planned. */
export function normalizePrescription(prescription) {
    if (!prescription) return null;
    const notes = cleanNote(prescription.notes);
    const tags = cleanTags(prescription.tags);
    const sets = (prescription.sets || []).map((plannedSet) => {
        const setTags = cleanTags(plannedSet.tags);
        return {
            metrics: plannedSet.metrics || [],
            notes: cleanNote(plannedSet.notes),
            ...(setTags.length ? { tags: setTags } : {}),
        };
    });
    const metrics = prescription.metrics || [];
    if (!notes && tags.length === 0 && sets.length === 0 && metrics.length === 0) return null;
    return {
        schema: PRESCRIPTION_SCHEMA_VERSION,
        ...(notes ? { notes } : {}),
        ...(tags.length ? { tags } : {}),
        ...(sets.length > 0 ? { sets } : {}),
        ...(sets.length === 0 && metrics.length > 0 ? { metrics } : {}),
    };
}

export function withPrescriptionNotes(prescription, notes) {
    return normalizePrescription({ ...(prescription || {}), notes });
}

export function withPrescriptionTags(prescription, tags) {
    return normalizePrescription({ ...(prescription || {}), tags });
}

export function withSetTags(prescription, setIndex, tags) {
    const sets = [...(prescription?.sets || [])];
    sets[setIndex] = { ...(sets[setIndex] || { metrics: [] }), tags };
    return normalizePrescription({ ...(prescription || {}), sets });
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

/** Short summary for collapsed rows, e.g. "3 sets", "4 rounds" or "2 values · note". */
export function summarizePrescription(prescription) {
    if (!prescription) return '';
    const parts = [];
    if (prescription.rounds?.length) {
        parts.push(`${prescription.rounds.length} round${prescription.rounds.length === 1 ? '' : 's'}`);
    } else if (prescription.sets?.length) {
        parts.push(`${prescription.sets.length} set${prescription.sets.length === 1 ? '' : 's'}`);
    } else if (prescription.metrics?.length) {
        parts.push(`${prescription.metrics.length} value${prescription.metrics.length === 1 ? '' : 's'}`);
    }
    if (
        prescription.notes
        || prescription.sets?.some((plannedSet) => plannedSet.notes)
        || prescription.rounds?.some((plannedRound) => plannedRound.notes)
    ) parts.push('notes');
    if (prescription.tags?.length || prescription.sets?.some((plannedSet) => plannedSet.tags?.length)) parts.push('tags');
    return parts.join(' · ');
}

// Circuit plans: { schema: 1, notes?, rounds: [{ notes?, slots: [{ slot_id, metrics: Entry[] }] }] }.
// A round with no values still counts: it plans how many rounds the session starts with.

export const MAX_CIRCUIT_PLAN_ROUNDS = 100;

/** A circuit's slots with the activity definition each one records. */
export function getCircuitPlanSlots(circuit, activityById = new Map()) {
    return [...(circuit?.slots || [])]
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
        .map((slot) => ({
            id: slot.id,
            definition: activityById.get(slot.activity_definition_id) || slot.activity || null,
        }))
        .filter((slot) => slot.definition);
}

export function normalizeCircuitPrescription(prescription) {
    if (!prescription) return null;
    const notes = cleanNote(prescription.notes);
    const rounds = (prescription.rounds || []).map((plannedRound) => ({
        slots: (plannedRound.slots || []).filter((slot) => (slot.metrics || []).length > 0),
        notes: cleanNote(plannedRound.notes),
    }));
    if (!notes && rounds.length === 0) return null;
    return {
        schema: PRESCRIPTION_SCHEMA_VERSION,
        ...(notes ? { notes } : {}),
        ...(rounds.length ? { rounds } : {}),
    };
}

export function getCircuitRoundEntries(prescription, roundIndex, slotId) {
    return prescription?.rounds?.[roundIndex]?.slots?.find((slot) => slot.slot_id === slotId)?.metrics || [];
}

export function withCircuitRoundValue(prescription, roundIndex, slotId, metricId, splitId, value) {
    const rounds = [...(prescription?.rounds || [])];
    const current = rounds[roundIndex] || { slots: [] };
    const slots = [...(current.slots || [])];
    const slotIndex = slots.findIndex((slot) => slot.slot_id === slotId);
    const existing = slotIndex >= 0 ? slots[slotIndex] : { slot_id: slotId, metrics: [] };
    const nextSlot = { ...existing, metrics: setEntryValue(existing.metrics, metricId, splitId, value) };
    if (slotIndex >= 0) slots[slotIndex] = nextSlot;
    else slots.push(nextSlot);
    rounds[roundIndex] = { ...current, slots };
    return normalizeCircuitPrescription({ ...(prescription || {}), rounds });
}

/** Append a round that repeats the last one's values, the usual next step when programming. */
export function withAddedRound(prescription) {
    const rounds = [...(prescription?.rounds || [])];
    if (rounds.length >= MAX_CIRCUIT_PLAN_ROUNDS) return prescription;
    const last = rounds[rounds.length - 1];
    rounds.push({
        slots: last ? last.slots.map((slot) => ({ ...slot, metrics: slot.metrics.map((entry) => ({ ...entry })) })) : [],
        notes: null,
    });
    return normalizeCircuitPrescription({ ...(prescription || {}), rounds });
}

export function withRemovedRound(prescription, roundIndex) {
    const rounds = (prescription?.rounds || []).filter((_, index) => index !== roundIndex);
    return normalizeCircuitPrescription({ ...(prescription || {}), rounds });
}

export function withRoundNotes(prescription, roundIndex, notes) {
    const rounds = [...(prescription?.rounds || [])];
    rounds[roundIndex] = { ...(rounds[roundIndex] || { slots: [] }), notes };
    return normalizeCircuitPrescription({ ...(prescription || {}), rounds });
}

export function withCircuitNotes(prescription, notes) {
    return normalizeCircuitPrescription({ ...(prescription || {}), notes });
}
