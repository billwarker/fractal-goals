// Relative change from one plan (or logged session) to another, for the Programs Days tab's
// right column: per-set changes and per-activity totals against the left column's card.

import { planAlignmentKeys } from './programDaysView';
import { getEntryValue, getPrescriptionColumns } from './prescriptionModel';
import {
    canComputeYield,
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
} from './progressAggregations';

/**
 * The change from `previous` to `current`, or null when either is missing. No change is null
 * too, unless `includeUnchanged` asks for it (`improved: null`, labelled `0%`).
 * `improved` follows the metric's direction. `percent` labels show ▲/▼ for better/worse and
 * fall back to a signed absolute change when the previous value is 0; `absolute` is signed.
 */
export function relativeDelta(current, previous, {
    higherIsBetter = true,
    mode = 'percent',
    includeUnchanged = false,
} = {}) {
    if (current == null || previous == null) return null;
    const delta = current - previous;
    if (delta === 0) {
        return includeUnchanged ? { delta: 0, pct: 0, improved: null, label: mode === 'absolute' ? '0' : '0%' } : null;
    }
    const improved = (delta > 0 && higherIsBetter) || (delta < 0 && !higherIsBetter);
    const pct = previous !== 0 ? Math.abs((delta / previous) * 100) : null;
    const signed = `${delta > 0 ? '+' : ''}${formatAggValue(delta)}`;
    const label = mode === 'absolute' || pct == null ? signed : `${improved ? '▲' : '▼'}${formatAggValue(pct)}%`;
    return { delta, pct, improved, label };
}

/** alignment key -> item of a plan's sections, so two columns' items pair as they line up. */
export function indexByAlignKey(templateId, sections) {
    const keys = planAlignmentKeys(templateId, sections);
    const index = new Map();
    (sections || []).forEach((section, sectionIndex) => (section.items || []).forEach((item, itemIndex) => {
        index.set(keys.items[sectionIndex][itemIndex], item);
    }));
    return index;
}

function toNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function trackedDefinitions(definition) {
    return filterTrackedMetricDefs(
        (definition?.metric_definitions || []).filter((metric) => metric.is_active !== false && !metric.deleted_at),
    );
}

function columnLabel(column) {
    const name = column.metric.unit || column.metric.name;
    return column.split ? `${column.split.name} ${name}` : name;
}

/** Each tracked column's change between two metric entry lists. */
function entryDeltas(columns, currentEntries, previousEntries, mode = 'percent') {
    return columns.flatMap((column) => {
        const splitId = column.split?.id ?? null;
        const change = relativeDelta(
            toNumber(getEntryValue(currentEntries, column.metric.id, splitId)),
            toNumber(getEntryValue(previousEntries, column.metric.id, splitId)),
            { higherIsBetter: column.metric.higher_is_better !== false, includeUnchanged: true, mode },
        );
        return change ? [{ key: column.key, metric: columnLabel(column), ...change }] : [];
    });
}

/**
 * One circuit member's change in one round: each tracked value of `definition` between the
 * round's current and compared entries. Null when the compared plan has no such round.
 */
export function compareCircuitSlot(definition, currentEntries, previousEntries, { mode = 'percent' } = {}) {
    if (!definition || previousEntries == null) return null;
    const trackedIds = new Set(trackedDefinitions(definition).map((metric) => metric.id));
    const columns = getPrescriptionColumns(definition).filter((column) => trackedIds.has(column.metric.id));
    return entryDeltas(columns, currentEntries, previousEntries, mode);
}

const yieldOf = (aggregations, setIndex) => (
    aggregations.yield_per_set.find((entry) => entry.set_index === setIndex)?.yield ?? null
);

/**
 * How `current` changed from `previous` for one activity:
 * - `sets[i]`: `{ isNew, deltas }` per current set (the set's yield when the activity has one,
 *   else each tracked value), paired by position;
 * - `flat`: each tracked value of an activity without sets;
 * Values present on both sides always have a change, `0%` when equal, so a fresh copy reads
 * as unchanged rather than blank.
 * - `totals`: total yield, or each additive total, with its change;
 * - `removedSets`: how many fewer sets than before.
 * Null without a previous prescription. `mode` is the session page's delta display mode
 * (`percent` or `absolute`).
 */
export function comparePrescriptions(current, previous, definition, { mode = 'percent' } = {}) {
    if (!previous || !definition) return null;
    const tracked = trackedDefinitions(definition);
    const trackedIds = new Set(tracked.map((metric) => metric.id));
    const columns = getPrescriptionColumns(definition).filter((column) => trackedIds.has(column.metric.id));
    const yieldEligible = canComputeYield(tracked);
    const currentSets = current?.sets || [];
    const previousSets = previous.sets || [];

    if (!definition.has_sets) {
        return {
            yieldEligible: false,
            sets: [],
            flat: entryDeltas(columns, current?.metrics, previous.metrics, mode),
            totals: [],
            removedSets: 0,
        };
    }

    const now = computeAutoAggregations(currentSets, tracked);
    const before = computeAutoAggregations(previousSets, tracked);
    const sets = currentSets.map((plannedSet, setIndex) => {
        if (setIndex >= previousSets.length) return { isNew: true, deltas: [] };
        if (yieldEligible) {
            const change = relativeDelta(yieldOf(now, setIndex), yieldOf(before, setIndex), { includeUnchanged: true, mode });
            return { isNew: false, deltas: change ? [{ key: 'yield', metric: 'yield', ...change }] : [] };
        }
        return { isNew: false, deltas: entryDeltas(columns, plannedSet.metrics, previousSets[setIndex].metrics, mode) };
    });

    const totals = yieldEligible
        ? (now.total_yield != null ? [{
            key: 'yield',
            label: 'Total yield',
            value: now.total_yield,
            unit: '',
            change: relativeDelta(now.total_yield, before.total_yield, { includeUnchanged: true, mode }),
        }] : [])
        : tracked
            .filter((metric) => metric.is_additive !== false && now.additive_totals[metric.id] != null)
            .map((metric) => ({
                key: metric.id,
                label: `Total ${metric.name}`,
                value: now.additive_totals[metric.id],
                unit: metric.unit || '',
                change: relativeDelta(now.additive_totals[metric.id], before.additive_totals[metric.id] ?? null, {
                    higherIsBetter: metric.higher_is_better !== false,
                    includeUnchanged: true,
                    mode,
                }),
            }));

    return {
        yieldEligible,
        sets,
        flat: [],
        totals,
        removedSets: Math.max(0, previousSets.length - currentSets.length),
    };
}
