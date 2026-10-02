import React from 'react';

import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import IconButton from '../atoms/IconButton';
import MetricValueEditor from '../sessionDetail/MetricValueEditor';
import {
    MAX_CIRCUIT_PLAN_ROUNDS,
    getCircuitPlanSlots,
    getCircuitRoundEntries,
    getEntryValue,
    getPrescriptionColumns,
    withAddedRound,
    withCircuitNotes,
    withCircuitRoundValue,
    withRemovedRound,
    withRoundNotes,
} from '../../utils/prescriptionModel';
import { normalizeMetricValueForStorage } from '../../utils/sessionActivityMetrics';
import { formatPlannedValue } from '../../utils/sessionPrescription';
import PlanNoteComposer from './PlanNoteComposer';
import styles from './PrescriptionEditor.module.css';
import usePlanRowSelection, { isItemSurfaceClick } from './usePlanRowSelection';

function columnLabel(column) {
    return column.split ? `${column.split.name} ${column.metric.name}` : column.metric.name;
}

/**
 * Plans a circuit: how many rounds the session starts with, each slot activity's values per
 * round, and notes. Values are reference targets only; they never become session results.
 * Clicking a round scopes the note composer to it, like a set in an activity plan.
 * `previous` (the plan this one was seeded from) shows as placeholders.
 *
 * `readOnly` shows the rounds in the same layout and fields with nothing to edit: a past
 * plan, or a session's logged rounds (`valueKind="logged"`, with the run's own `slots`).
 */
export default function CircuitPrescriptionEditor({
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
}) {
    const slots = slotsOverride || getCircuitPlanSlots(circuit, activityById);
    const rounds = value?.rounds || [];
    const { selectedIndex, clearSelection, rowProps } = usePlanRowSelection(
        active && !readOnly,
        rounds.length,
        onSelectRound ? { selectedIndex: selectedRoundIndex ?? null, onSelect: onSelectRound } : null,
    );
    const scopedRound = selectedIndex == null ? null : rounds[selectedIndex];
    const name = circuit?.name || 'this circuit';

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
            <div
                className={styles.rounds}
                role="group"
                aria-label={`${valueKind === 'logged' ? 'Logged' : 'Planned'} rounds`}
            >
                {rounds.map((plannedRound, roundIndex) => {
                    const isSelected = selectedIndex === roundIndex;
                    return (
                        // Planned rounds have no identity beyond their position.
                        <div
                            key={roundIndex}
                            className={[
                                styles.round,
                                readOnly ? styles.roundStatic : '',
                                isSelected ? styles.roundSelected : '',
                            ].filter(Boolean).join(' ')}
                            {...(readOnly ? {} : rowProps(roundIndex))}
                        >
                            <div className={styles.roundHeader}>
                                {readOnly ? (
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
                            {slots.map((slot) => {
                                const columns = getPrescriptionColumns(slot.definition);
                                const entries = getCircuitRoundEntries(value, roundIndex, slot.id);
                                const previousEntries = getCircuitRoundEntries(previous, roundIndex, slot.id);
                                return (
                                    <div key={slot.id} className={styles.roundSlot}>
                                        <span className={styles.roundSlotName}>{slot.definition.name}</span>
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
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </span>
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
