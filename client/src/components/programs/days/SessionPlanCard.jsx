import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../../atoms/Badge';
import Button from '../../atoms/Button';
import CloseIcon from '../../atoms/CloseIcon';
import ActivitySelectorPanel from '../../common/ActivitySelectorPanel';
import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import PlanTagEditor from '../../prescriptions/PlanTagEditor';
import PrescriptionEditor from '../../prescriptions/PrescriptionEditor';
import { isItemSurfaceClick, shouldScopeOnFocus } from '../../prescriptions/usePlanRowSelection';
import { formatLiteralDate } from '../../../utils/dateUtils';
import { withPrescriptionTags } from '../../../utils/prescriptionModel';
import { planAlignmentKeys } from '../../../utils/programDaysView';
import {
    addPlanItem,
    describePlanSource,
    indexPrescriptionsByItemKey,
    movePlanItem,
    removePlanItem,
    setPlanItemPrescription,
} from '../../../utils/sessionPlanDraft';
import CircuitPrescriptionEditor from '../../prescriptions/CircuitPrescriptionEditor';
import styles from './ProgramDaysView.module.css';

function errorMessage(error) {
    return error?.response?.data?.error || error?.message || 'Something went wrong.';
}

function formatShortDate(value) {
    return formatLiteralDate(value, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
}

/**
 * One template's plan for one occurrence date. Edits stay local until Save; the
 * card is keyed by the stored version, so a saved or reset plan remounts clean.
 */
export default function SessionPlanCard({
    rootId,
    entry,
    elementId,
    activityById,
    circuitById = new Map(),
    activities,
    circuits,
    activityGroups,
    mutations,
    readOnly = false,
}) {
    // Only unsaved edits are local. An untouched card always shows the latest server plan,
    // so a seed refreshes when the plan it comes from is saved in the neighbouring column.
    const [draftSections, setDraftSections] = useState(null);
    const isDirty = draftSections !== null;
    const sections = draftSections ?? entry.sections;
    const [pickerSectionIndex, setPickerSectionIndex] = useState(null);
    // What is scoped, as on the session page: an item, optionally narrowed to one of its
    // sets or rounds. The note composer and tag pickers follow it.
    const [scope, setScope] = useState({ itemKey: null, rowIndex: null });
    const scopeItem = (itemKey) => setScope((current) => (
        current.itemKey === itemKey ? current : { itemKey, rowIndex: null }
    ));
    const [conflict, setConflict] = useState(false);
    const [error, setError] = useState('');
    const previousByKey = useMemo(
        () => indexPrescriptionsByItemKey(entry.previous?.sections),
        [entry.previous],
    );
    const templateId = entry.template.id;
    const alignKeys = planAlignmentKeys(templateId, sections);
    const activityName = (activityId) => activityById.get(activityId)?.name || 'Activity';
    // The day's mutations are shared by every card; only this template's requests count here.
    const isPendingHere = (mutation) => mutation.isPending && mutation.variables?.templateId === templateId;
    const isSaving = isPendingHere(mutations.save);
    const isBusy = isSaving || isPendingHere(mutations.reset) || isPendingHere(mutations.pullTemplate);

    const edit = (updater) => {
        setDraftSections((current) => updater(current ?? entry.sections));
        setError('');
    };

    const handleFailure = (mutationError) => {
        if (mutationError?.response?.status === 409) {
            setConflict(true);
            return;
        }
        setError(errorMessage(mutationError));
    };

    const save = () => mutations.save.mutate(
        { templateId, sections, rowVersion: entry.row_version },
        { onError: handleFailure },
    );
    const reset = () => {
        if (!window.confirm(`Discard the plan for ${entry.template.name} on this date? It will start again from ${entry.previous ? 'the previous plan' : 'the template'}.`)) return;
        mutations.reset.mutate({ templateId }, { onError: handleFailure });
    };
    const pullTemplate = () => mutations.pullTemplate.mutate(
        { templateId, rowVersion: entry.row_version },
        { onError: handleFailure },
    );

    return (
        <article
            id={elementId}
            data-align-key={alignKeys.card}
            tabIndex={-1}
            className={styles.planCard}
            aria-label={`${entry.template.name} plan, ${formatShortDate(entry.date)}`}
        >
            <header className={styles.planCardHeader}>
                <SessionTemplateNameBadge name={entry.template.name} color={entry.template.color} wrap />
                <span className={styles.planSource}>
                    {describePlanSource(entry, formatShortDate)}
                    {!entry.is_required ? ' · optional' : ''}
                </span>
            </header>


            {readOnly ? (
                <p className={styles.planReadOnlyNote}>Past program day · this plan can&apos;t be changed.</p>
            ) : null}

            {entry.template_changed && !readOnly ? (
                <div className={styles.planNotice} role="status">
                    <span>The template changed since this plan was made.</span>
                    <Button size="sm" variant="secondary" onClick={pullTemplate} disabled={isBusy || isDirty}>
                        Pull changes
                    </Button>
                </div>
            ) : null}

            {entry.executed_sessions.length ? (
                <ul className={styles.executedList} aria-label="Sessions from this plan">
                    {entry.executed_sessions.map((session) => (
                        <li key={session.id}>
                            <Link to={`/${rootId}/session/${session.id}`}>
                                {session.completed ? 'Done' : 'In progress'}: {session.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}

            {sections.map((section, sectionIndex) => (
                <section
                    key={section.id || section.name}
                    className={styles.planSection}
                    data-align-key={alignKeys.sections[sectionIndex]}
                >
                    <h4 className={styles.planSectionTitle}>{section.name}</h4>
                    {(section.items || []).length === 0 ? (
                        <p className={styles.planEmpty}>No activities in this section.</p>
                    ) : null}
                    {(section.items || []).map((item, itemIndex) => {
                        const definition = item.type === 'activity'
                            ? activityById.get(item.activity_definition_id || item.activity_id || item.id)
                            : null;
                        const circuit = item.type === 'circuit' ? circuitById.get(item.circuit_definition_id) : null;
                        const name = item.name || definition?.name || circuit?.name
                            || (item.type === 'circuit' ? 'Circuit' : 'Activity');
                        const itemKey = item.item_key || `${sectionIndex}:${itemIndex}`;
                        const isSelected = !readOnly && scope.itemKey === itemKey;
                        const rowScope = {
                            selectedIndex: isSelected ? scope.rowIndex : null,
                            onSelect: (rowIndex) => setScope({ itemKey, rowIndex }),
                        };
                        return (
                            <div
                                key={itemKey}
                                className={[
                                    styles.planItem,
                                    readOnly ? '' : styles.planItemSelectable,
                                    isSelected ? styles.planItemSelected : '',
                                ].filter(Boolean).join(' ')}
                                data-align-key={alignKeys.items[sectionIndex][itemIndex]}
                                data-selected={isSelected ? 'true' : undefined}
                                onClick={readOnly ? undefined : (event) => {
                                    // A click on the item itself (not a set or a control) scopes back to the whole item.
                                    if (isItemSurfaceClick(event)) setScope({ itemKey, rowIndex: null });
                                    else scopeItem(itemKey);
                                }}
                                onFocus={readOnly ? undefined : (event) => { if (shouldScopeOnFocus(event)) scopeItem(itemKey); }}
                            >
                                <div className={styles.planItemHeader}>
                                    <span className={styles.planItemName}>
                                        {name}
                                        {item.type === 'circuit' ? <Badge size="sm">Circuit</Badge> : null}
                                        {item.added_in_plan ? <Badge size="sm" variant="info">Added</Badge> : null}
                                    </span>
                                    {!readOnly ? (
                                        <span className={styles.planItemActions}>
                                            <button
                                                type="button"
                                                onClick={() => edit((current) => movePlanItem(current, sectionIndex, itemIndex, -1))}
                                                disabled={itemIndex === 0}
                                                aria-label={`Move ${name} up`}
                                            >↑</button>
                                            <button
                                                type="button"
                                                onClick={() => edit((current) => movePlanItem(current, sectionIndex, itemIndex, 1))}
                                                disabled={itemIndex === section.items.length - 1}
                                                aria-label={`Move ${name} down`}
                                            >↓</button>
                                            {definition ? (
                                                <PlanTagEditor
                                                    rootId={rootId}
                                                    definition={definition}
                                                    tagIds={item.prescription?.tags || []}
                                                    editable={isSelected && !isBusy}
                                                    onChangeTags={(tagIds) => edit((current) => setPlanItemPrescription(
                                                        current,
                                                        sectionIndex,
                                                        itemIndex,
                                                        withPrescriptionTags(current[sectionIndex].items[itemIndex].prescription, tagIds),
                                                    ))}
                                                />
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setScope({ itemKey: null, rowIndex: null });
                                                    edit((current) => removePlanItem(current, sectionIndex, itemIndex));
                                                }}
                                                aria-label={`Remove ${name} from this plan`}
                                            ><CloseIcon size={12} /></button>
                                        </span>
                                    ) : null}
                                </div>
                                {definition ? (
                                    // A past day shows the same fields, read-only, so it lines up beside a live plan.
                                    <PrescriptionEditor
                                        rootId={rootId}
                                        definition={definition}
                                        itemName={name}
                                        active={isSelected}
                                        readOnly={readOnly}
                                        emptyText="No planned values."
                                        showItemTags={readOnly}
                                        selectedSetIndex={rowScope.selectedIndex}
                                        onSelectSet={rowScope.onSelect}
                                        value={item.prescription || null}
                                        previous={previousByKey.get(item.item_key) || null}
                                        idPrefix={`plan-${templateId}-${item.item_key || itemIndex}`}
                                        disabled={isBusy}
                                        onChange={(prescription) => edit((current) => (
                                            setPlanItemPrescription(current, sectionIndex, itemIndex, prescription)
                                        ))}
                                    />
                                ) : null}
                                {circuit && (!readOnly || item.prescription?.rounds?.length) ? (
                                    <CircuitPrescriptionEditor
                                        circuit={circuit}
                                        active={isSelected}
                                        readOnly={readOnly}
                                        selectedRoundIndex={rowScope.selectedIndex}
                                        onSelectRound={rowScope.onSelect}
                                        activityById={activityById}
                                        value={item.prescription || null}
                                        previous={previousByKey.get(item.item_key) || null}
                                        idPrefix={`plan-${templateId}-${item.item_key || itemIndex}`}
                                        disabled={isBusy}
                                        onChange={(prescription) => edit((current) => (
                                            setPlanItemPrescription(current, sectionIndex, itemIndex, prescription)
                                        ))}
                                    />
                                ) : null}
                                {circuit?.slots?.length && readOnly && !item.prescription?.rounds?.length ? (
                                    <ol className={styles.circuitMembers} aria-label={`${name} activities`}>
                                        {circuit.slots.map((slot) => (
                                            <li key={slot.id}>{slot.activity?.name || activityName(slot.activity_definition_id)}</li>
                                        ))}
                                    </ol>
                                ) : null}
                                {item.type === 'activity' && !definition ? (
                                    <p className={styles.planEmpty}>This activity was deleted and will be skipped.</p>
                                ) : null}
                            </div>
                        );
                    })}
                    {!readOnly && pickerSectionIndex === sectionIndex ? (
                        <div className={styles.planPicker}>
                            <ActivitySelectorPanel
                                activities={activities}
                                circuits={circuits}
                                activityGroups={activityGroups}
                                showTypeToggle
                                closeOnSelect
                                onClose={() => setPickerSectionIndex(null)}
                                onSelectActivity={(activity) => {
                                    edit((current) => addPlanItem(current, sectionIndex, activity));
                                    setPickerSectionIndex(null);
                                }}
                                onSelectCircuit={(circuit) => {
                                    edit((current) => addPlanItem(current, sectionIndex, {
                                        circuit_definition_id: circuit.id,
                                        name: circuit.name,
                                    }));
                                    setPickerSectionIndex(null);
                                }}
                            />
                        </div>
                    ) : null}
                    {!readOnly && pickerSectionIndex !== sectionIndex ? (
                        <button
                            type="button"
                            className={styles.addPlanItem}
                            onClick={() => setPickerSectionIndex(sectionIndex)}
                        >+ Add activity</button>
                    ) : null}
                </section>
            ))}


            {conflict ? (
                <div className={styles.planNotice} role="alert">
                    <span>This plan changed somewhere else. Reload to see the latest version; your edits here will be lost.</span>
                    <Button size="sm" variant="secondary" onClick={mutations.refresh}>Reload</Button>
                </div>
            ) : null}
            {error ? <p className={styles.planError} role="alert">{error}</p> : null}

            {!readOnly ? (
                <footer className={styles.planCardFooter}>
                    {entry.plan_id ? (
                        <Button size="sm" variant="ghost" onClick={reset} disabled={isBusy}>Reset</Button>
                    ) : <span />}
                    <span className={styles.planFooterActions}>
                        {isDirty ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => { setDraftSections(null); setError(''); }}
                                disabled={isBusy}
                            >Discard</Button>
                        ) : null}
                        <Button size="sm" variant="primary" onClick={save} disabled={isBusy || (!isDirty && Boolean(entry.plan_id))}>
                            {isSaving ? 'Saving…' : entry.plan_id ? 'Save' : 'Save plan'}
                        </Button>
                    </span>
                </footer>
            ) : null}
        </article>
    );
}
