import React from 'react';

import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import IconButton from '../atoms/IconButton';
import MetricValueEditor from '../sessionDetail/MetricValueEditor';
import {
    MAX_CIRCUIT_PLAN_ROUNDS,
    getCircuitPlanSlots,
    getCircuitRoundEntries,
    getCircuitRoundTags,
    getEntryValue,
    getPrescriptionColumns,
    withAddedRound,
    withCircuitNotes,
    withCircuitRoundValue,
    withCircuitSlotTags,
    withCircuitTags,
    withRemovedRound,
    withRoundNotes,
    withRoundTags,
} from '../../utils/prescriptionModel';
import { resolveEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { compareCircuitSlot } from '../../utils/planComparison';
import { planRowAlignKey } from '../../utils/programDaysView';
import { normalizeMetricValueForStorage } from '../../utils/sessionActivityMetrics';
import { formatPlannedValue } from '../../utils/sessionPrescription';
import PlanDeltaChip from './PlanDeltaChip';
import PlanNoteComposer from './PlanNoteComposer';
import PlanTagEditor from './PlanTagEditor';
import styles from './PrescriptionEditor.module.css';
import usePlanRowSelection, { isItemSurfaceClick } from './usePlanRowSelection';

function columnLabel(column) {
    return column.split ? `${column.split.name} ${column.metric.name}` : column.metric.name;
}

/**
 * Alignment kinds for a round's activity rows, by activity (not slot id: a logged run's slots
 * have their own ids), counting repeats so an activity listed twice keeps two rows.
 */
function slotAlignKinds(slots) {
    const counts = new Map();
    return slots.map((slot) => {
        const activityId = slot.activity_definition_id || slot.definition?.id || slot.id;
        const n = counts.get(activityId) || 0;
        counts.set(activityId, n + 1);
        return `round-slot:${activityId}:${n}`;
    });
}

/**
 * Plans a circuit: how many rounds the session starts with, each slot activity's values per
 * round, and notes. Values are reference targets only; they never become session results.
 * Clicking a round scopes the note composer to it, like a set in an activity plan.
 * `previous` (the plan this one was seeded from) shows as placeholders.
 *
 * `readOnly` shows the rounds in the same layout and fields with nothing to edit: a past
 * plan, or a session's logged rounds (`valueKind="logged"`, with the run's own `slots`).
 * `alignKey` (the item's alignment key) marks each round and its activity rows so compared
 * columns line up row by row.
 *
 * With `onSelectSlot`, each round's activities are selectable too, as circuit members are on
 * the session page: `onSelectSlot(roundIndex, slotId)` picks one (`slotId` null goes back to
 * the round) and `selectedSlot` ({ roundIndex, slotId }) marks it, read-only or not.
 * Read-only rounds remain selectable when the caller supplies `onSelectRound`.
 *
 * Tags plan where the session page puts them: on the circuit (`showCircuitTags`, unless the
 * caller shows them itself), on a selected round, or on a selected round member. Each shows
 * the enclosing scopes' tags as inherited. Needs `rootId`.
 *
 * `comparison` (the compared plan's circuit prescription) shows each value's change from it,
 * round by round, beside the value; a round it lacks is marked new. Slots pair by the circuit's
 * slot id (a logged run's slot by its `source_slot_id`).
 */
export default function CircuitPrescriptionEditor({
    rootId = null,
    circuit,
    activityById,
    value,
    onChange,
    previous = null,
    idPrefix,
    disabled = false,
    active = true,
    selectedRoundIndex,
    onSelectRound = null,
    readOnly = false,
    valueKind = 'planned',
    slots: slotsOverride = null,
    alignKey = null,
    selectedSlot = null,
    onSelectSlot = null,
    comparison = null,
    comparisonDate = null,
    showCircuitTags = true,
    progressSettings = null,
}) {
    const comparedRounds = comparison?.rounds || [];
    const slots = slotsOverride || getCircuitPlanSlots(circuit, activityById);
    const slotKinds = slotAlignKinds(slots);
    const rounds = value?.rounds || [];
    const { selectedIndex, clearSelection, rowProps } = usePlanRowSelection(
        active && (!readOnly || Boolean(onSelectRound)),
        rounds.length,
        onSelectRound ? { selectedIndex: selectedRoundIndex ?? null, onSelect: onSelectRound } : null,
    );
    const scopedRound = selectedIndex == null ? null : rounds[selectedIndex];
    const name = circuit?.name || 'this circuit';
    const editable = active && !disabled && !readOnly;
    const circuitTagIds = value?.tags || [];

    const commit = (roundIndex, slotId, column, rawValue) => {
        const normalized = normalizeMetricValueForStorage(column.metric, rawValue);
        if (normalized === null) return false;
        onChange(withCircuitRoundValue(value, roundIndex, slotId, column.metric.id, column.split?.id ?? null, normalized));
        return true;
    };

    return (
        <div
            className={styles.editor}
            onClick={(event) => { if (isItemSurfaceClick(event)) clearSelection(); }}
        >
            {showCircuitTags ? (
                <PlanTagEditor
                    rootId={rootId}
                    scopeId={circuit?.id}
                    tagIds={circuitTagIds}
                    editable={editable && selectedIndex == null}
                    onChangeTags={(tagIds) => onChange(withCircuitTags(value, tagIds))}
                    scopeLabel="Circuit tags"
                    className={styles.itemMeta}
                />
            ) : null}
            <div
                className={styles.rounds}
                role="group"
                aria-label={`${valueKind === 'logged' ? 'Logged' : 'Planned'} rounds`}
            >
                {rounds.map((plannedRound, roundIndex) => {
                    const isSelected = selectedIndex === roundIndex;
                    const roundTagIds = getCircuitRoundTags(value, roundIndex);
                    const isMemberSelected = selectedSlot?.roundIndex === roundIndex && Boolean(selectedSlot?.slotId);
                    return (
                        // Planned rounds have no identity beyond their position.
                        <div
                            key={roundIndex}
                            className={[
                                styles.round,
                                readOnly && !onSelectRound ? styles.roundStatic : '',
                                isSelected ? styles.roundSelected : '',
                            ].filter(Boolean).join(' ')}
                            data-align-key={planRowAlignKey(alignKey, 'round', roundIndex)}
                            {...(readOnly && !onSelectRound ? {} : rowProps(roundIndex))}
                        >
                            <div className={styles.roundHeader}>
                                {readOnly && !onSelectRound ? (
                                    <span className={`${styles.setToggle} ${styles.roundTitle}`}>Round {roundIndex + 1}</span>
                                ) : (
                                    <Button
                                        unstyled
                                        className={`${styles.setToggle} ${styles.roundTitle}`}
                                        data-scope-toggle
                                        aria-pressed={isSelected}
                                        aria-label={`Round ${roundIndex + 1}${isSelected ? ', selected' : ''}`}
                                    >
                                        Round {roundIndex + 1}
                                    </Button>
                                )}
                                {comparison && roundIndex >= comparedRounds.length ? (
                                    <PlanDeltaChip isNew subject={`Round ${roundIndex + 1}`} comparisonDate={comparisonDate} />
                                ) : null}
                                <PlanTagEditor
                                    rootId={rootId}
                                    scopeId={circuit?.id}
                                    tagIds={roundTagIds}
                                    inheritedTagIds={circuitTagIds}
                                    editable={editable && isSelected && !isMemberSelected}
                                    onChangeTags={(tagIds) => onChange(withRoundTags(value, roundIndex, tagIds))}
                                    className={styles.roundTags}
                                    scopeLabel={`Round ${roundIndex + 1} tags`}
                                    setScope
                                />
                                {/* Read-only keeps the remove button's space so rounds match a live plan's height. */}
                                {readOnly ? <span className={styles.rowActionSpacer} aria-hidden="true" /> : (
                                    <IconButton
                                        size="sm"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            clearSelection();
                                            onChange(withRemovedRound(value, roundIndex));
                                        }}
                                        disabled={disabled}
                                        aria-label={`Remove planned round ${roundIndex + 1}`}
                                    >
                                        <CloseIcon size={12} />
                                    </IconButton>
                                )}
                            </div>
                            {/* One activity per row; every round lays out the same, so values line up. */}
                            {slots.map((slot, slotIndex) => {
                                const columns = getPrescriptionColumns(slot.definition);
                                const entries = getCircuitRoundEntries(value, roundIndex, slot.id);
                                const previousEntries = getCircuitRoundEntries(previous, roundIndex, slot.id);
                                const deltas = comparison && roundIndex < comparedRounds.length
                                    ? compareCircuitSlot(
                                        slot.definition,
                                        entries,
                                        getCircuitRoundEntries(comparison, roundIndex, slot.source_slot_id || slot.id),
                                        { mode: resolveEffectiveDeltaDisplayMode(slot.definition, progressSettings) },
                                    )
                                    : null;
                                const isSlotSelected = selectedSlot?.roundIndex === roundIndex
                                    && selectedSlot?.slotId === slot.id;
                                const slotLabel = `Round ${roundIndex + 1} ${slot.definition.name}`;
                                return (
                                    <div
                                        key={slot.id}
                                        className={`${styles.roundSlot} ${isSlotSelected ? styles.roundSlotSelected : ''}`.trim()}
                                        data-scope-member={onSelectSlot ? '' : undefined}
                                        data-selected={isSlotSelected ? 'true' : undefined}
                                        onClick={onSelectSlot ? (event) => {
                                            // The member owns this click: its round and item are scoped with it.
                                            event.stopPropagation();
                                            const target = event.target instanceof Element ? event.target : null;
                                            const isField = target?.closest('input, select, textarea, label');
                                            onSelectSlot(roundIndex, isSlotSelected && !isField ? null : slot.id);
                                        } : undefined}
                                        data-align-key={alignKey
                                            ? planRowAlignKey(`${alignKey}|round#${roundIndex}`, slotKinds[slotIndex])
                                            : undefined}
                                    >
                                        {onSelectSlot ? (
                                            <Button
                                                unstyled
                                                className={`${styles.roundSlotName} ${styles.roundSlotToggle}`}
                                                aria-pressed={isSlotSelected}
                                                aria-label={`${slotLabel}${isSlotSelected ? ', selected' : ''}`}
                                            >
                                                {slot.definition.name}
                                            </Button>
                                        ) : (
                                            <span className={styles.roundSlotName}>{slot.definition.name}</span>
                                        )}
                                        <span className={styles.roundSlotValues}>
                                            {columns.length === 0 ? (
                                                <span className={styles.columnLabel}>No metrics</span>
                                            ) : columns.map((column) => {
                                                const ghost = getEntryValue(previousEntries, column.metric.id, column.split?.id ?? null);
                                                return (
                                                    <label key={column.key} className={styles.roundSlotField}>
                                                        <span className={styles.roundSlotLabel}>{columnLabel(column)}</span>
                                                        <span className={styles.valueCell}>
                                                            <MetricValueEditor
                                                                metricDef={column.metric}
                                                                value={getEntryValue(entries, column.metric.id, column.split?.id ?? null) ?? ''}
                                                                inputClassName={styles.valueInput}
                                                                metaClassName={styles.valueMeta}
                                                                unitClassName={styles.valueUnit}
                                                                inputId={`${idPrefix}-r${roundIndex}-${slot.id}-${column.key}`}
                                                                ariaLabel={`Round ${roundIndex + 1} ${slot.definition.name} ${valueKind} ${columnLabel(column)}`}
                                                                placeholder={readOnly || ghost == null ? undefined : formatPlannedValue(column.metric, ghost)}
                                                                disabled={disabled}
                                                                readOnly={readOnly}
                                                                onDraftChange={() => {}}
                                                                onCommit={(rawValue) => (readOnly ? false : commit(roundIndex, slot.id, column, rawValue))}
                                                            />
                                                            {deltas ? (
                                                                <PlanDeltaChip
                                                                    deltas={deltas.filter((change) => change.key === column.key)}
                                                                    subject={`Round ${roundIndex + 1} ${slot.definition.name}`}
                                                                    comparisonDate={comparisonDate}
                                                                />
                                                            ) : null}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </span>
                                        <PlanTagEditor
                                            rootId={rootId}
                                            definition={slot.definition}
                                            tagIds={getCircuitRoundTags(value, roundIndex, slot.id)}
                                            inheritedTagIds={[...circuitTagIds, ...roundTagIds]}
                                            editable={editable && isSlotSelected}
                                            onChangeTags={(tagIds) => onChange(withCircuitSlotTags(value, roundIndex, slot.id, tagIds))}
                                            className={styles.roundSlotTags}
                                            scopeLabel={`${slotLabel} tags`}
                                            setScope
                                        />
                                    </div>
                                );
                            })}
                            {plannedRound.notes && !isSelected ? (
                                <p className={styles.plannedNote}>{plannedRound.notes}</p>
                            ) : null}
                        </div>
                    );
                })}
                {readOnly ? null : (
                    <Button
                        size="sm"
                        variant="secondary"
                        className={styles.addSet}
                        onClick={() => onChange(withAddedRound(value))}
                        disabled={disabled || rounds.length >= MAX_CIRCUIT_PLAN_ROUNDS}
                    >
                        + Add round
                    </Button>
                )}
            </div>
            {value?.notes && !(active && !readOnly && selectedIndex == null) ? (
                <p className={styles.plannedNote}>{value.notes}</p>
            ) : null}
            {active && !readOnly ? (
                scopedRound ? (
                    <PlanNoteComposer
                        scopeKey={`round-${selectedIndex}`}
                        label={`Note for ${name} · Round ${selectedIndex + 1}`}
                        value={scopedRound.notes}
                        placeholder={previous?.rounds?.[selectedIndex]?.notes || `Add a programming note for round ${selectedIndex + 1}…`}
                        disabled={disabled}
                        onCommit={(notes) => onChange(withRoundNotes(value, selectedIndex, notes))}
                    />
                ) : (
                    <PlanNoteComposer
                        scopeKey="item"
                        label={`Coaching note for ${name}`}
                        value={value?.notes}
                        placeholder={previous?.notes || 'Add a programming note for this circuit, or pick a round…'}
                        disabled={disabled}
                        onCommit={(notes) => onChange(withCircuitNotes(value, notes))}
                    />
                )
            ) : null}
        </div>
    );
}
