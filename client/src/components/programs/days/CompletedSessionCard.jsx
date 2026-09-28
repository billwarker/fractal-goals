import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import Badge from '../../atoms/Badge';
import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import { queryKeys } from '../../../hooks/queryKeys';
import { fractalApi } from '../../../utils/api';
import { planAlignmentKeys } from '../../../utils/programDaysView';
import { ActivityValuesTable, CircuitValuesTable } from './ValuesTables';
import styles from './ProgramDaysView.module.css';

/** A session section's recorded work items, from hydrated typed items or legacy exercises. */
export function sessionSectionItems(section) {
    if (Array.isArray(section?.items) && section.items.some((item) => item?.activity || item?.circuit)) {
        return section.items
            .map((item) => {
                if (item?.type === 'circuit' && item.circuit) return { type: 'circuit', circuit: item.circuit };
                if (item?.type === 'activity' && item.activity) return { type: 'activity', activity: item.activity };
                return null;
            })
            .filter(Boolean);
    }
    return (section?.exercises || []).map((activity) => ({ type: 'activity', activity }));
}

function activityIdOf(activity) {
    return activity.activity_id || activity.activity_definition_id;
}

/**
 * The session that completed a program day's template, in the plan card's layout: the
 * session's own sections with each activity's logged sets, and each circuit's logged rounds.
 * Shares the session detail cache. `alignmentPrefix` (the template it completed) lines its
 * rows up with the same template's plan in the other column.
 */
export default function CompletedSessionCard({ rootId, sessionId, template, activities, alignmentPrefix = null }) {
    const query = useQuery({
        queryKey: queryKeys.session(rootId, sessionId),
        queryFn: async () => (await fractalApi.getSession(rootId, sessionId)).data,
        enabled: Boolean(rootId && sessionId),
        staleTime: 60 * 1000,
    });
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

    if (query.isLoading) return <p className={styles.state} aria-busy="true">Loading session…</p>;
    if (query.error || !query.data) {
        return (
            <p className={styles.state} role="alert">
                The session could not be loaded. <button type="button" onClick={() => query.refetch()}>Retry</button>
            </p>
        );
    }
    const session = query.data;

    const renderActivity = (activity) => {
        const definition = activityById.get(activityIdOf(activity));
        if (!definition) return null;
        return (
            <ActivityValuesTable
                definition={definition}
                values={{
                    sets: (activity.sets || []).map((loggedSet) => ({ metrics: loggedSet.metrics, notes: loggedSet.notes })),
                    metrics: activity.metrics || [],
                    notes: activity.notes || null,
                }}
                caption="Logged values"
                emptyText="No values logged."
            />
        );
    };

    const renderCircuit = (run) => {
        const slots = [...(run.slots || [])]
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((slot) => ({
                id: slot.id,
                definition: activityById.get(slot.activity_definition_id)
                    || { ...(slot.activity_schema || {}), name: slot.activity_name },
            }));
        const rounds = [...(run.rounds || [])].sort((left, right) => left.round_number - right.round_number);
        return (
            <CircuitValuesTable
                name={run.name}
                slots={slots}
                roundCount={rounds.length}
                entriesFor={(roundIndex, slotId) => (
                    rounds[roundIndex]?.members?.find((member) => member.circuit_run_slot_id === slotId)?.metrics || []
                )}
                caption="Logged rounds"
            />
        );
    };

    return (
        <article
            className={styles.planCard}
            data-align-key={alignKeys ? `${alignmentPrefix}|card` : undefined}
            aria-label={`${template.name} session`}
        >
            <header className={styles.planCardHeader}>
                <SessionTemplateNameBadge name={template.name} color={template.color} wrap />
                <Link className={styles.planSource} to={`/${rootId}/session/${session.id}`}>
                    {session.completed ? 'Completed' : 'In progress'} · Open session
                </Link>
            </header>
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
                        return (
                            <div
                                key={isCircuit ? item.circuit.id : (item.activity.instance_id || item.activity.id || itemIndex)}
                                className={styles.planItem}
                                data-align-key={alignKeys?.items[sectionIndex][itemIndex]}
                            >
                                <div className={styles.planItemHeader}>
                                    <span className={styles.planItemName}>
                                        {name}
                                        {isCircuit ? <Badge size="sm">Circuit</Badge> : null}
                                    </span>
                                </div>
                                {isCircuit ? renderCircuit(item.circuit) : renderActivity(item.activity)}
                            </div>
                        );
                    })}
                </section>
            ))}
        </article>
    );
}
