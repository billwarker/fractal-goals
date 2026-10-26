import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import Badge from '../../atoms/Badge';
import { sessionDetailQueryOptions } from '../../../hooks/useSessionQueries';
import {
    activityIdOf,
    loggedActivityValue,
    loggedCircuitRounds,
    loggedCircuitSlots,
    sessionSectionItems,
} from '../../../utils/loggedSessionPlan';
import { indexByAlignKey } from '../../../utils/planComparison';
import { planAlignmentKeys } from '../../../utils/programDaysView';
import CircuitPrescriptionEditor from '../../prescriptions/CircuitPrescriptionEditor';
import PrescriptionEditor from '../../prescriptions/PrescriptionEditor';
import { isCardBackgroundClick, isItemSurfaceClick } from '../../prescriptions/usePlanRowSelection';
import CompletedSessionHeader from './CompletedSessionHeader';
import styles from './ProgramDaysView.module.css';

const noop = () => {};

/**
 * The session that completed a program day's template, in the plan card's layout: the
 * session's own sections with each activity's logged sets, and each circuit's logged rounds,
 * in the plan editors' read-only fields so they compare field for field with a plan.
 * Shares the session detail cache. `alignmentPrefix` (the template it completed) lines its
 * rows up with the same template's plan in the other column.
 */
export default function CompletedSessionCard({
    rootId,
    sessionId,
    template,
    activities,
    alignmentPrefix = null,
    date = null,
    isActive = false,
    onActivate = null,
    onReport = null,
    comparison = null,
    progressSettings = null,
}) {
    const query = useQuery(sessionDetailQueryOptions(rootId, sessionId));
    const activityById = useMemo(
        () => new Map((activities || []).map((activity) => [activity.id, activity])),
        [activities],
    );
    const sections = useMemo(
        () => (query.data?.attributes?.session_data?.sections || []).map((section) => ({
            name: section.name,
            items: sessionSectionItems(section),
        })),
        [query.data],
    );
    const alignKeys = useMemo(() => (alignmentPrefix ? planAlignmentKeys(alignmentPrefix, sections.map((section) => ({
        name: section.name,
        items: section.items.map((item) => (item.type === 'circuit'
            ? { type: 'circuit', circuit_definition_id: item.circuit.circuit_definition_id }
            : { type: 'activity', activity_definition_id: activityIdOf(item.activity) })),
    }))) : null), [alignmentPrefix, sections]);

    // With a comparison (the other column's card for this template), each activity shows its
    // change from the paired one there.
    const comparedByKey = useMemo(
        () => (alignmentPrefix && comparison && !comparison.isLoading && comparison.kind !== 'empty'
            ? indexByAlignKey(alignmentPrefix, comparison.sections)
            : null),
        [alignmentPrefix, comparison],
    );

    // The Goals side pane follows this card when active: the session's own goal evidence, and
    // the goals of an activity picked here (picking only highlights; nothing is editable).
    // `{ key, activityId, roundIndex?, slotId? }`: an item, round, or circuit member.
    const [selected, setSelected] = useState(null);
    const instances = useMemo(() => sections.flatMap((section) => section.items.flatMap((item) => {
        if (item.type === 'circuit') {
            const done = Boolean(item.circuit.completed || item.circuit.completed_at);
            return (item.circuit.slots || [])
                .filter((slot) => slot.activity_definition_id)
                .map((slot) => ({
                    id: `${item.circuit.id}:${slot.id}`,
                    activity_definition_id: String(slot.activity_definition_id),
                    completed: done,
                    associated_goal_ids: [],
                }));
        }
        const activityId = activityIdOf(item.activity);
        return activityId ? [{
            id: item.activity.instance_id || item.activity.id,
            activity_definition_id: String(activityId),
            completed: Boolean(item.activity.completed),
            associated_goal_ids: item.activity.associated_goal_ids || [],
        }] : [];
    })), [sections]);
    const selectedActivityId = selected?.activityId || null;
    const reportKey = JSON.stringify([instances, selectedActivityId]);
    useEffect(() => {
        if (!isActive || !onReport || !query.data) return;
        const [reportedInstances, reportedSelection] = JSON.parse(reportKey);
        onReport({
            date,
            templateId: template.id,
            templateName: template.name,
            readOnly: true,
            sessionId,
            instances: reportedInstances,
            activityIds: [...new Set(reportedInstances.map((instance) => instance.activity_definition_id))].sort(),
            selectedActivityId: reportedSelection,
        });
    }, [date, isActive, onReport, query.data, reportKey, sessionId, template.id, template.name]);

    if (query.isLoading) return <p className={styles.state} aria-busy="true">Loading session…</p>;
    if (query.error || !query.data) {
        return (
            <p className={styles.state} role="alert">
                The session could not be loaded. <button type="button" onClick={() => query.refetch()}>Retry</button>
            </p>
        );
    }
    const session = query.data;

    const renderActivity = (activity, alignKey) => {
        const compared = comparedByKey?.get(alignKey);
        const definition = activityById.get(activityIdOf(activity));
        if (!definition) return null;
        return (
            <PrescriptionEditor
                rootId={rootId}
                definition={definition}
                value={loggedActivityValue(activity)}
                onChange={noop}
                idPrefix={`logged-${sessionId}-${activity.instance_id || activity.id}`}
                active={false}
                readOnly
                valueKind="logged"
                emptyText="No values logged."
                alignKey={alignKey}
                comparison={compared?.type === 'activity' ? compared.prescription || {} : null}
                comparisonDate={comparison?.date || null}
                progressSettings={progressSettings}
            />
        );
    };

    const renderCircuit = (run, alignKey, itemKey) => {
        const compared = comparedByKey?.get(alignKey);
        const slots = loggedCircuitSlots(run, activityById);
        // The logged rounds in the plan's shape, so the circuit editor shows them read-only.
        const rounds = loggedCircuitRounds(run, slots);
        if (!rounds.length) return <p className={styles.planEmpty}>No rounds logged.</p>;
        return (
            <CircuitPrescriptionEditor
                circuit={{ name: run.name }}
                slots={slots}
                value={{ rounds, notes: null }}
                onChange={noop}
                idPrefix={`logged-${sessionId}-${run.id}`}
                active={selected?.key === itemKey}
                readOnly
                valueKind="logged"
                alignKey={alignKey}
                comparison={compared?.type === 'circuit' ? compared.prescription || {} : null}
                comparisonDate={comparison?.date || null}
                progressSettings={progressSettings}
                selectedRoundIndex={selected?.key === itemKey ? selected.roundIndex : null}
                onSelectRound={(roundIndex) => setSelected({ key: itemKey, activityId: null, roundIndex })}
                selectedSlot={selected?.key === itemKey && selected.slotId
                    ? { roundIndex: selected.roundIndex, slotId: selected.slotId }
                    : null}
                onSelectSlot={(roundIndex, slotId) => {
                    const slot = slots.find((candidate) => candidate.id === slotId);
                    setSelected(slot ? {
                        key: itemKey,
                        activityId: slot.activity_definition_id ? String(slot.activity_definition_id) : null,
                        roundIndex,
                        slotId,
                    } : { key: itemKey, activityId: null, roundIndex });
                }}
            />
        );
    };

    return (
        <article
            className={`${styles.planCard} ${isActive ? styles.planCardActive : ''}`.trim()}
            data-active={isActive ? 'true' : undefined}
            data-align-key={alignKeys ? `${alignmentPrefix}|card` : undefined}
            aria-label={`${template.name} session`}
            onClickCapture={onActivate || undefined}
            onFocusCapture={onActivate || undefined}
            onClick={(event) => { if (isCardBackgroundClick(event)) setSelected(null); }}
        >
            <CompletedSessionHeader rootId={rootId} session={session} template={template} />
            {sections.length === 0 ? <p className={styles.planEmpty}>No activities were recorded in this session.</p> : null}
            {sections.map((section, sectionIndex) => (
                // Sections have no identity beyond their position in the session.
                <section key={sectionIndex} className={styles.planSection} data-align-key={alignKeys?.sections[sectionIndex]}>
                    <h4 className={styles.planSectionTitle}>{section.name}</h4>
                    {section.items.length === 0 ? <p className={styles.planEmpty}>No activities in this section.</p> : null}
                    {section.items.map((item, itemIndex) => {
                        const isCircuit = item.type === 'circuit';
                        const name = isCircuit
                            ? item.circuit.name
                            : item.activity.name || activityById.get(activityIdOf(item.activity))?.name || 'Activity';
                        const itemKey = isCircuit
                            ? `c:${item.circuit.id}`
                            : `a:${activityIdOf(item.activity)}:${item.activity.instance_id || item.activity.id || itemIndex}`;
                        const isHighlighted = selected?.key === itemKey;
                        return (
                            <div
                                key={itemKey}
                                className={`${styles.planItem} ${styles.planItemSelectable} ${isHighlighted ? styles.planItemSelected : ''}`.trim()}
                                data-align-key={alignKeys?.items[sectionIndex][itemIndex]}
                                data-plan-item
                                data-selected={isHighlighted ? 'true' : undefined}
                                onClick={(event) => {
                                    const selectsWholeItem = isItemSurfaceClick(event);
                                    setSelected((current) => !selectsWholeItem && current?.key === itemKey ? current : {
                                        key: itemKey,
                                        activityId: isCircuit ? null : String(activityIdOf(item.activity)),
                                    });
                                }}
                            >
                                <div className={styles.planItemHeader}>
                                    <span className={styles.planItemName}>
                                        {name}
                                        {isCircuit ? <Badge size="sm">Circuit</Badge> : null}
                                    </span>
                                </div>
                                {isCircuit
                                    ? renderCircuit(item.circuit, alignKeys?.items[sectionIndex][itemIndex], itemKey)
                                    : renderActivity(item.activity, alignKeys?.items[sectionIndex][itemIndex])}
                            </div>
                        );
                    })}
                </section>
            ))}
        </article>
    );
}
