import React from 'react';

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
    withPrescriptionTags,
    withRemovedSet,
    withSetNotes,
    withSetTags,
    withSetValue,
} from '../../utils/prescriptionModel';
import { normalizeMetricValueForStorage } from '../../utils/sessionActivityMetrics';
import { formatPlannedValue } from '../../utils/sessionPrescription';
import PlanNoteComposer from './PlanNoteComposer';
import PlanTagEditor from './PlanTagEditor';
import styles from './PrescriptionEditor.module.css';
import usePlanRowSelection, { isItemSurfaceClick } from './usePlanRowSelection';

function columnLabel(column) {
    return column.split ? `${column.split.name} ${column.metric.name}` : column.metric.name;
}

function ghostValue(column, entries) {
    const value = getEntryValue(entries, column.metric.id, column.split?.id ?? null);
    return value == null ? undefined : formatPlannedValue(column.metric, value);
}

/**
 * Edits the planned values, tags and notes for one activity item. Values are reference
 * targets only; they never become session results.
 *
 * Like an activity on the session page, the item is scoped by clicking: `active` means the
 * item is selected, and clicking a set row narrows the scope to that set. Whatever is scoped
 * gets the note composer at the bottom and an editable tag picker; clicking the item's own
 * surface goes back to the whole item. `selectedSetIndex`/`onSelectSet` let the caller own
 * the set scope, and `showItemTags={false}` when the caller shows the item's tags itself.
 *
 * `previous` is the plan this one was seeded from; its values show as placeholders
 * so the user sees the step they are programming.
 *
 * `readOnly` shows values in the same layout and fields with nothing to edit: a past plan,
 * or what a session logged (`valueKind="logged"`), so either lines up beside a live plan.
 * `emptyText` replaces the layout when a read-only value has nothing in it.
 */
export default function PrescriptionEditor({
    rootId,
    definition,
    value,
    onChange,
    previous = null,
    idPrefix,
    disabled = false,
    active = true,
    itemName = null,
    selectedSetIndex,
    onSelectSet = null,
    showItemTags = true,
    readOnly = false,
    valueKind = 'planned',
    emptyText = null,
}) {
    const columns = getPrescriptionColumns(definition);
    const hasSets = Boolean(definition?.has_sets);
    const sets = value?.sets || [];
    const { selectedIndex, clearSelection, rowProps } = usePlanRowSelection(
        active && !readOnly,
        hasSets ? sets.length : 0,
        onSelectSet ? { selectedIndex: selectedSetIndex ?? null, onSelect: onSelectSet } : null,
    );
    const activityTagIds = value?.tags || [];
    const activityTags = (definition?.tags || []).filter((tag) => activityTagIds.includes(tag.id));
    const editable = active && !disabled && !readOnly;
    const name = itemName || definition?.name || 'this activity';

    const commitValue = (column, rawValue, setIndex = null) => {
        const normalized = normalizeMetricValueForStorage(column.metric, rawValue);
        if (normalized === null) return false;
        const splitId = column.split?.id ?? null;
        onChange(setIndex == null
            ? withFlatValue(value, column.metric.id, splitId, normalized)
            : withSetValue(value, setIndex, column.metric.id, splitId, normalized));
        return true;
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
                ariaLabel={`${setIndex == null ? '' : `Set ${setIndex + 1} `}${valueKind} ${columnLabel(column)}`}
                placeholder={readOnly ? undefined : ghostValue(column, previousEntries)}
                disabled={disabled}
                readOnly={readOnly}
                onDraftChange={() => {}}
                onCommit={(rawValue) => (readOnly ? false : commitValue(column, rawValue, setIndex))}
            />
        </div>
    );

    const scopedSet = selectedIndex == null ? null : sets[selectedIndex];
    const activityTagsControl = showItemTags ? (
        <PlanTagEditor
            rootId={rootId}
            definition={definition}
            tagIds={activityTagIds}
            onChangeTags={(tagIds) => onChange(withPrescriptionTags(value, tagIds))}
            editable={editable}
        />
    ) : null;
    // The scoped note is edited in the composer, so it isn't repeated above it.
    const showActivityNote = Boolean(value?.notes) && !(active && !readOnly && selectedIndex == null);
    const groupLabel = `${valueKind === 'logged' ? 'Logged' : 'Planned'} ${hasSets ? 'sets' : 'values'}`;

    const hasContent = Boolean(value?.metrics?.length || sets.length || value?.notes || activityTagIds.length);
    if (readOnly && emptyText && !hasContent) {
        return <p className={styles.plannedNote}>{emptyText}</p>;
    }

    return (
        <div
            className={styles.editor}
            onClick={(event) => { if (isItemSurfaceClick(event)) clearSelection(); }}
        >
            {activityTagsControl || showActivityNote ? (
                <div className={styles.itemMeta}>
                    {activityTagsControl}
                    {showActivityNote ? <p className={styles.plannedNote}>{value.notes}</p> : null}
                </div>
            ) : null}
            {columns.length > 0 && hasSets && (
                <div
                    className={styles.setTable}
                    role="group"
                    aria-label={groupLabel}
                    style={{ '--plan-columns': columns.length }}
                >
                    <div className={styles.headerRow} aria-hidden="true">
                        <span className={styles.setLabel}>Set</span>
                        {columns.map((column) => (
                            <span key={column.key} className={styles.columnLabel}>{columnLabel(column)}</span>
                        ))}
                        <span />
                        <span />
                    </div>
                    {sets.map((plannedSet, setIndex) => {
                        const isSelected = selectedIndex === setIndex;
                        const setTagIds = plannedSet.tags || [];
                        const showSetNote = Boolean(plannedSet.notes) && !isSelected;
                        return (
                            // Planned sets have no identity beyond their position.
                            <div
                                key={setIndex}
                                className={[
                                    styles.setBlock,
                                    readOnly ? styles.setBlockStatic : '',
                                    isSelected ? styles.setBlockSelected : '',
                                ].filter(Boolean).join(' ')}
                                {...(readOnly ? {} : rowProps(setIndex))}
                            >
                                <div className={styles.setRow}>
                                    {readOnly ? (
                                        <span className={styles.setToggle}>S{setIndex + 1}</span>
                                    ) : (
                                        <Button
                                            unstyled
                                            className={styles.setToggle}
                                            data-scope-toggle
                                            aria-pressed={isSelected}
                                            aria-label={`Set ${setIndex + 1}${isSelected ? ', selected' : ''}`}
                                        >
                                            S{setIndex + 1}
                                        </Button>
                                    )}
                                    {columns.map((column) => renderValueCell(
                                        column,
                                        plannedSet.metrics,
                                        previous?.sets?.[setIndex]?.metrics,
                                        setIndex,
                                    ))}
                                    <span className={styles.setExtras}>
                                        <PlanTagEditor
                                            rootId={rootId}
                                            definition={definition}
                                            tagIds={setTagIds}
                                            onChangeTags={(tagIds) => onChange(withSetTags(value, setIndex, tagIds))}
                                            editable={editable && isSelected}
                                            inheritedTags={activityTags}
                                            setScope
                                        />
                                    </span>
                                    {/* Read-only keeps the remove column empty so values sit where a live plan's do. */}
                                    {readOnly ? <span className={styles.rowActionSpacer} aria-hidden="true" /> : (
                                        <IconButton
                                            size="sm"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                clearSelection();
                                                onChange(withRemovedSet(value, setIndex));
                                            }}
                                            disabled={disabled}
                                            aria-label={`Remove planned set ${setIndex + 1}`}
                                        >
                                            <CloseIcon size={12} />
                                        </IconButton>
                                    )}
                                </div>
                                {showSetNote ? <p className={`${styles.plannedNote} ${styles.setNote}`}>{plannedSet.notes}</p> : null}
                            </div>
                        );
                    })}
                    {readOnly ? null : (
                        <Button
                            size="sm"
                            variant="secondary"
                            className={styles.addSet}
                            onClick={() => onChange(withAddedSet(value))}
                            disabled={disabled || sets.length >= MAX_PRESCRIPTION_SETS}
                        >
                            + Add set
                        </Button>
                    )}
                </div>
            )}
            {columns.length > 0 && !hasSets && (
                <div className={styles.flatRow} role="group" aria-label={groupLabel}>
                    {columns.map((column) => (
                        <label key={column.key} className={styles.flatField}>
                            <span className={styles.columnLabel}>{columnLabel(column)}</span>
                            {renderValueCell(column, value?.metrics, previous?.metrics)}
                        </label>
                    ))}
                </div>
            )}
            {active && !readOnly ? (
                scopedSet ? (
                    <PlanNoteComposer
                        scopeKey={`set-${selectedIndex}`}
                        label={`Note for ${name} · Set ${selectedIndex + 1}`}
                        value={scopedSet.notes}
                        placeholder={previous?.sets?.[selectedIndex]?.notes || `Add a programming note for set ${selectedIndex + 1}…`}
                        disabled={disabled}
                        onCommit={(notes) => onChange(withSetNotes(value, selectedIndex, notes))}
                    />
                ) : (
                    <PlanNoteComposer
                        scopeKey="item"
                        label={`Coaching note for ${name}`}
                        value={value?.notes}
                        placeholder={previous?.notes || (hasSets ? 'Add a programming note for this activity, or pick a set…' : 'Add a programming note for this activity…')}
                        disabled={disabled}
                        onCommit={(notes) => onChange(withPrescriptionNotes(value, notes))}
                    />
                )
            ) : null}
        </div>
    );
}
