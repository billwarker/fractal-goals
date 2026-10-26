// Copy one program day date's plan, or what its session logged, onto another date's plan of the
// same template in the Programs Days tab. Only items and values are copied: notes and tags are
// not. The result is an unsaved draft; Save validates it on the server as any other edit.

import { formatLiteralDate } from './dateUtils';
import {
    getPrescriptionColumns,
    MAX_CIRCUIT_PLAN_ROUNDS,
    MAX_PRESCRIPTION_SETS,
    normalizeCircuitPrescription,
    normalizePrescription,
} from './prescriptionModel';
import { planAlignmentKeys } from './programDaysView';

export function formatCopyDate(value) {
    return formatLiteralDate(value, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
}

const hasItems = (sections) => (sections || []).some((section) => (section.items || []).length > 0);

/**
 * Whether a plan card can copy from its comparison (the other column's card for the same
 * template). Null hides Copy: no comparison for this template, or a past date that keeps its
 * plan. Otherwise `{ allowed, reason }`, where `reason` explains a disabled Copy.
 */
export function planCopyEligibility({ entry, comparison, readOnly = false }) {
    if (!comparison || readOnly) return null;
    if (comparison.isLoading) return { allowed: false, reason: `Loading ${formatCopyDate(comparison.date)}…` };
    if (comparison.kind === 'empty' || !hasItems(comparison.sections)) {
        return { allowed: false, reason: `Nothing to copy from ${formatCopyDate(comparison.date)}.` };
    }
    // A started session already took its own copy of the plan; changing it now would split them.
    if (entry.executed_sessions?.length) {
        return { allowed: false, reason: 'A session has already started from this plan.' };
    }
    return { allowed: true, reason: null };
}

function newItemKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `plan-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const metricRef = (entry) => entry?.metric_id || entry?.metric_definition_id || null;

/** Entries for the given metric columns only, with numeric values. */
function keepEntries(entries, allowed) {
    return (entries || []).flatMap((entry) => {
        const metricId = metricRef(entry);
        const splitId = entry?.split_id ?? null;
        const value = entry?.value == null || entry.value === '' ? NaN : Number(entry.value);
        if (!metricId || !Number.isFinite(value) || !allowed.has(`${metricId}:${splitId ?? ''}`)) return [];
        return [{ metric_id: metricId, split_id: splitId, value }];
    });
}

/** An activity's values only: its sets (or flat values for activities without sets). */
export function copyActivityValues(prescription, definition) {
    if (!prescription || !definition) return null;
    const allowed = new Set(getPrescriptionColumns(definition)
        .map((column) => `${column.metric.id}:${column.split?.id ?? ''}`));
    if (definition.has_sets) {
        const sets = (prescription.sets || [])
            .map((plannedSet) => keepEntries(plannedSet?.metrics, allowed))
            .filter((metrics) => metrics.length > 0)
            .slice(0, MAX_PRESCRIPTION_SETS)
            .map((metrics) => ({ metrics }));
        return normalizePrescription({ sets });
    }
    return normalizePrescription({ metrics: keepEntries(prescription.metrics, allowed) });
}

/** A circuit's rounds and values only, for the circuit's current slots. */
export function copyCircuitValues(prescription, circuit, activityById = new Map()) {
    if (!prescription || !circuit) return null;
    const allowedBySlot = new Map((circuit.slots || []).map((slot) => {
        const definition = activityById.get(slot.activity_definition_id) || slot.activity || null;
        return [slot.id, new Set(getPrescriptionColumns(definition)
            .map((column) => `${column.metric.id}:${column.split?.id ?? ''}`))];
    }));
    const rounds = (prescription.rounds || []).slice(0, MAX_CIRCUIT_PLAN_ROUNDS).map((round) => ({
        slots: (round?.slots || []).flatMap((slot) => {
            const allowed = allowedBySlot.get(slot?.slot_id);
            if (!allowed) return [];
            const metrics = keepEntries(slot.metrics, allowed);
            return metrics.length ? [{ slot_id: slot.slot_id, metrics }] : [];
        }),
        notes: null,
    }));
    return normalizeCircuitPrescription({ rounds });
}

const itemKeysOf = (sections) => new Set((sections || [])
    .flatMap((section) => (section.items || []).map((item) => item.item_key).filter(Boolean)));

const itemName = (item, fallback) => item.name || fallback || (item.type === 'circuit' ? 'Circuit' : 'Activity');

/**
 * The target plan's sections replaced by the source's items and values.
 *
 * - Sections stay the target's (the template's); each takes the source section with its name,
 *   or empties when the source has none. Items of other source sections are skipped.
 * - Items keep their identity: a plan source's `item_key` (or one the target knows) is kept with
 *   its template link; else the target item in the same aligned position lends its key; else the
 *   item is new to the plan (`added_in_plan`). No key is used twice.
 * - Deleted activities and circuits are skipped.
 *
 * Returns `{ sections, skipped: [{ name, reason }] }`.
 */
export function copyPlanSections({
    templateId,
    source,
    targetSections,
    activityById = new Map(),
    circuitById = new Map(),
    makeKey = newItemKey,
}) {
    const sourceSections = source?.sections || [];
    const knownKeys = itemKeysOf(targetSections);
    // A plan's items carry the template's keys, or their own for items added in it.
    const keepsKey = (item) => source?.kind === 'plan' || knownKeys.has(item.item_key);
    const targetByKey = new Map((targetSections || [])
        .flatMap((section) => (section.items || []).map((item) => [item.item_key, item])));
    const targetAlign = planAlignmentKeys(templateId, targetSections);
    const targetByAlign = new Map((targetSections || []).flatMap((section, sectionIndex) => (
        (section.items || []).map((item, itemIndex) => [targetAlign.items[sectionIndex][itemIndex], item])
    )));
    const sourceAlign = planAlignmentKeys(templateId, sourceSections);
    const targetNames = new Set((targetSections || []).map((section) => section.name));
    const used = new Set();
    const skipped = [];

    sourceSections.forEach((section) => {
        if (targetNames.has(section.name)) return;
        (section.items || []).forEach((item) => skipped.push({
            name: itemName(item),
            reason: `“${section.name}” is no longer in this template`,
        }));
    });

    const copyItem = (item, alignKey) => {
        const isCircuit = item.type === 'circuit';
        const definitionId = isCircuit
            ? item.circuit_definition_id
            : item.activity_definition_id || item.activity_id || item.id;
        const definition = isCircuit ? circuitById.get(definitionId) : activityById.get(definitionId);
        if (!definition) {
            skipped.push({ name: itemName(item), reason: `this ${isCircuit ? 'circuit' : 'activity'} was deleted` });
            return null;
        }
        let match = null;
        if (item.item_key && keepsKey(item) && !used.has(item.item_key)) {
            match = { key: item.item_key, base: targetByKey.get(item.item_key) || null };
        } else {
            const aligned = targetByAlign.get(alignKey);
            if (aligned?.item_key && !used.has(aligned.item_key)) match = { key: aligned.item_key, base: aligned };
        }
        const key = match?.key || makeKey();
        used.add(key);
        const addedInPlan = match ? Boolean(match.base ? match.base.added_in_plan : item.added_in_plan) : true;
        const prescription = isCircuit
            ? copyCircuitValues(item.prescription, definition, activityById)
            : copyActivityValues(item.prescription, definition);
        const next = {
            ...(match?.base || {}),
            type: isCircuit ? 'circuit' : 'activity',
            ...(isCircuit ? { circuit_definition_id: definitionId } : { activity_definition_id: definitionId }),
            name: itemName(item, definition.name),
            item_key: key,
        };
        delete next.prescription;
        delete next.added_in_plan;
        return {
            ...next,
            ...(addedInPlan ? { added_in_plan: true } : {}),
            ...(prescription ? { prescription } : {}),
        };
    };

    const sections = (targetSections || []).map((section) => {
        const sourceIndex = sourceSections.findIndex((candidate) => candidate.name === section.name);
        const items = sourceIndex < 0 ? [] : (sourceSections[sourceIndex].items || [])
            .map((item, itemIndex) => copyItem(item, sourceAlign.items[sourceIndex][itemIndex]))
            .filter(Boolean);
        return { ...section, items };
    });
    return { sections, skipped };
}
