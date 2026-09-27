import React, { useState } from 'react';

import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import IconButton from '../atoms/IconButton';
import MetricValueEditor from '../sessionDetail/MetricValueEditor';
import {
    MAX_PRESCRIPTION_SETS,
    getEntryValue,
    getPrescriptionColumns,
    withAddedSet,
    withFlatValue,
    withPrescriptionNotes,
    withRemovedSet,
    withSetNotes,
    withSetValue,
} from '../../utils/prescriptionModel';
import { normalizeMetricValueForStorage } from '../../utils/sessionActivityMetrics';
import { formatPlannedValue } from '../../utils/sessionPrescription';
import styles from './PrescriptionEditor.module.css';

function columnLabel(column) {
    return column.split ? `${column.split.name} ${column.metric.name}` : column.metric.name;
}

function ghostValue(column, entries) {
    const value = getEntryValue(entries, column.metric.id, column.split?.id ?? null);
    return value == null ? undefined : formatPlannedValue(column.metric, value);
}

/**
 * Edits the planned values and notes for one activity item. Values are reference
 * targets only; they never become session results.
 *
 * `previous` is the plan this one was seeded from; its values show as placeholders
 * so the user sees the step they are programming.
 */
export default function PrescriptionEditor({
    definition,
    value,
    onChange,
    previous = null,
    idPrefix,
    disabled = false,
}) {
    const [openSetNotes, setOpenSetNotes] = useState(() => new Set());
    const columns = getPrescriptionColumns(definition);
    const hasSets = Boolean(definition?.has_sets);
    const sets = value?.sets || [];

    const commitValue = (column, rawValue, setIndex = null) => {
        const normalized = normalizeMetricValueForStorage(column.metric, rawValue);
        if (normalized === null) return false;
        const splitId = column.split?.id ?? null;
        onChange(setIndex == null
            ? withFlatValue(value, column.metric.id, splitId, normalized)
            : withSetValue(value, setIndex, column.metric.id, splitId, normalized));
        return true;
    };

    const toggleSetNote = (setIndex) => {
        setOpenSetNotes((current) => {
            const next = new Set(current);
            if (next.has(setIndex)) next.delete(setIndex);
            else next.add(setIndex);
            return next;
        });
    };

    const renderValueCell = (column, entries, previousEntries, setIndex = null) => (
        <div key={column.key} className={styles.valueCell}>
            <MetricValueEditor
                metricDef={column.metric}
                value={getEntryValue(entries, column.metric.id, column.split?.id ?? null) ?? ''}
                inputClassName={styles.valueInput}
                metaClassName={styles.valueMeta}
                unitClassName={styles.valueUnit}
                inputId={`${idPrefix}-${setIndex ?? 'flat'}-${column.key}`}
                ariaLabel={`${setIndex == null ? '' : `Set ${setIndex + 1} `}planned ${columnLabel(column)}`}
                placeholder={ghostValue(column, previousEntries)}
                disabled={disabled}
                onDraftChange={() => {}}
                onCommit={(rawValue) => commitValue(column, rawValue, setIndex)}
            />
        </div>
    );

    return (
        <div className={styles.editor}>
            {columns.length > 0 && hasSets && (
                <div
                    className={styles.setTable}
                    role="group"
                    aria-label="Planned sets"
                    style={{ '--plan-columns': columns.length }}
                >
                    <div className={styles.headerRow} aria-hidden="true">
                        <span className={styles.setLabel}>Set</span>
                        {columns.map((column) => (
                            <span key={column.key} className={styles.columnLabel}>{columnLabel(column)}</span>
                        ))}
                        <span />
                    </div>
                    {sets.map((plannedSet, setIndex) => {
                        const noteOpen = openSetNotes.has(setIndex) || Boolean(plannedSet.notes);
                        return (
                            // Planned sets have no identity beyond their position.
                            <div key={setIndex} className={styles.setBlock}>
                                <div className={styles.setRow}>
                                    <span className={styles.setLabel}>S{setIndex + 1}</span>
                                    {columns.map((column) => renderValueCell(
                                        column,
                                        plannedSet.metrics,
                                        previous?.sets?.[setIndex]?.metrics,
                                        setIndex,
                                    ))}
                                    <span className={styles.rowActions}>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => toggleSetNote(setIndex)}
                                            disabled={disabled || Boolean(plannedSet.notes)}
                                            aria-expanded={noteOpen}
                                        >
                                            Note
                                        </Button>
                                        <IconButton
                                            size="sm"
                                            onClick={() => onChange(withRemovedSet(value, setIndex))}
                                            disabled={disabled}
                                            aria-label={`Remove planned set ${setIndex + 1}`}
                                        >
                                            <CloseIcon size={12} />
                                        </IconButton>
                                    </span>
                                </div>
                                {noteOpen && (
                                    <input
                                        // Remount when the committed note moves (e.g. a set above is removed).
                                        key={plannedSet.notes || ''}
                                        type="text"
                                        className={styles.noteInput}
                                        defaultValue={plannedSet.notes || ''}
                                        placeholder={previous?.sets?.[setIndex]?.notes || 'Set note'}
                                        aria-label={`Set ${setIndex + 1} note`}
                                        maxLength={1000}
                                        disabled={disabled}
                                        onBlur={(event) => onChange(withSetNotes(value, setIndex, event.target.value))}
                                    />
                                )}
                            </div>
                        );
                    })}
                    <Button
                        size="sm"
                        variant="secondary"
                        className={styles.addSet}
                        onClick={() => onChange(withAddedSet(value))}
                        disabled={disabled || sets.length >= MAX_PRESCRIPTION_SETS}
                    >
                        + Add set
                    </Button>
                </div>
            )}
            {columns.length > 0 && !hasSets && (
                <div className={styles.flatRow} role="group" aria-label="Planned values">
                    {columns.map((column) => (
                        <label key={column.key} className={styles.flatField}>
                            <span className={styles.columnLabel}>{columnLabel(column)}</span>
                            {renderValueCell(column, value?.metrics, previous?.metrics)}
                        </label>
                    ))}
                </div>
            )}
            <textarea
                key={value?.notes || ''}
                className={styles.activityNote}
                defaultValue={value?.notes || ''}
                placeholder={previous?.notes || 'Coaching note for this activity'}
                aria-label="Activity plan note"
                rows={1}
                maxLength={1000}
                disabled={disabled}
                onBlur={(event) => {
                    if ((event.target.value || '') !== (value?.notes || '')) {
                        onChange(withPrescriptionNotes(value, event.target.value));
                    }
                }}
            />
        </div>
    );
}
