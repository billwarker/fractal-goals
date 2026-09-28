import React from 'react';

import {
    getCircuitPlanSlots,
    getCircuitRoundEntries,
    getEntryValue,
    getPrescriptionColumns,
} from '../../../utils/prescriptionModel';
import { formatPlannedValue } from '../../../utils/sessionPrescription';
import styles from './ProgramDaysView.module.css';

function hasValues(values) {
    return Boolean(values?.metrics?.length || values?.sets?.some((valueSet) => valueSet.metrics?.length));
}

function describeEntries(definition, entries) {
    return getPrescriptionColumns(definition)
        .map((column) => {
            const value = getEntryValue(entries, column.metric.id, column.split?.id ?? null);
            if (value == null) return null;
            const label = column.split ? `${column.split.name} ` : '';
            return `${label}${formatPlannedValue(column.metric, value)} ${column.metric.unit}`.trim();
        })
        .filter(Boolean)
        .join(' · ');
}

/**
 * One activity's values, read-only: planned values on a past day, or what a completed
 * session logged. `values` is `{ sets?: [{ metrics, notes }], metrics?, notes? }`.
 */
export function ActivityValuesTable({ definition, values, caption, emptyText, footer = null }) {
    if (!hasValues(values)) return footer || <p className={styles.planEmpty}>{emptyText}</p>;
    const columns = getPrescriptionColumns(definition);
    const rows = values.sets?.length
        ? values.sets.map((valueSet, index) => ({ label: `S${index + 1}`, entries: valueSet.metrics }))
        : [{ label: null, entries: values.metrics }];
    return (
        <div className={styles.logged}>
            <table className={styles.loggedTable}>
                <caption className={styles.visuallyHidden}>{caption} for {definition?.name || 'activity'}</caption>
                <thead>
                    <tr>
                        {rows[0].label ? <th scope="col">Set</th> : null}
                        {columns.map((column) => (
                            <th key={column.key} scope="col">
                                {column.split ? `${column.split.name} ${column.metric.name}` : column.metric.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label || 'values'}>
                            {row.label ? <th scope="row">{row.label}</th> : null}
                            {columns.map((column) => {
                                const value = getEntryValue(row.entries, column.metric.id, column.split?.id ?? null);
                                return (
                                    <td key={column.key} className={styles.loggedValue}>
                                        {value == null ? <span className={styles.loggedEmpty}>–</span> : (
                                            <>
                                                {formatPlannedValue(column.metric, value)}
                                                <span className={styles.loggedUnit}> {column.metric.unit}</span>
                                            </>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {values.notes ? <p className={styles.loggedNote}>{values.notes}</p> : null}
            {footer}
        </div>
    );
}

/**
 * A circuit's values, read-only: one row per round, one column per slot activity.
 * `entriesFor(roundIndex, slotId)` returns that member's metric entries.
 */
export function CircuitValuesTable({ name, slots, roundCount, entriesFor, caption, notes = null }) {
    return (
        <div className={styles.logged}>
            <table className={styles.loggedTable}>
                <caption className={styles.visuallyHidden}>{caption} for {name || 'circuit'}</caption>
                <thead>
                    <tr>
                        <th scope="col">Round</th>
                        {slots.map((slot) => <th key={slot.id} scope="col">{slot.definition.name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: roundCount }, (_, roundIndex) => (
                        // Rounds have no identity beyond their position.
                        <tr key={roundIndex}>
                            <th scope="row">R{roundIndex + 1}</th>
                            {slots.map((slot) => (
                                <td key={slot.id} className={styles.loggedValue}>
                                    {describeEntries(slot.definition, entriesFor(roundIndex, slot.id))
                                        || <span className={styles.loggedEmpty}>–</span>}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {notes ? <p className={styles.loggedNote}>{notes}</p> : null}
        </div>
    );
}

/** "Paused · S2 Top set": the planned tags by name, with set tags labelled by set. */
export function describePlannedTags(definition, prescription) {
    const nameById = new Map((definition?.tags || []).map((tag) => [tag.id, tag.name]));
    const names = (tagIds, prefix = '') => (tagIds || [])
        .filter((tagId) => nameById.has(tagId))
        .map((tagId) => `${prefix}${nameById.get(tagId)}`);
    return [
        ...names(prescription?.tags),
        ...(prescription?.sets || []).flatMap((plannedSet, index) => names(plannedSet.tags, `S${index + 1} `)),
    ].join(' · ');
}

/** A past program day's planned values for one activity. */
export function PlannedValuesTable({ definition, prescription }) {
    const tagSummary = describePlannedTags(definition, prescription);
    const values = prescription
        ? {
            metrics: prescription.metrics || [],
            sets: (prescription.sets || []).map((plannedSet) => ({ metrics: plannedSet.metrics, notes: plannedSet.notes })),
            notes: prescription.notes || null,
        }
        : null;
    return (
        <ActivityValuesTable
            definition={definition}
            values={values}
            caption="Planned values"
            emptyText="No planned values."
            footer={tagSummary ? <p className={styles.loggedNote}>Tags: {tagSummary}</p> : null}
        />
    );
}

/** A past program day's planned circuit rounds. */
export function PlannedCircuitTable({ circuit, activityById, prescription }) {
    return (
        <CircuitValuesTable
            name={circuit?.name}
            slots={getCircuitPlanSlots(circuit, activityById)}
            roundCount={(prescription.rounds || []).length}
            entriesFor={(roundIndex, slotId) => getCircuitRoundEntries(prescription, roundIndex, slotId)}
            caption="Planned rounds"
            notes={prescription.notes}
        />
    );
}
