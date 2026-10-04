import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { useProgramDayPlans, useProgramSessionPlanMutations } from '../../../hooks/useProgramSessionPlans';
import { formatLiteralDate } from '../../../utils/dateUtils';
import { occurrenceStatus, planCardElementId } from '../../../utils/programDaysView';
import EmptyState from '../../common/EmptyState';
import ProgramDayStatusMark from '../ProgramDayStatusMark';
import CompletedSessionCard from './CompletedSessionCard';
import OptionalTemplateSelector from './OptionalTemplateSelector';
import SessionPlanCard from './SessionPlanCard';
import styles from './ProgramDaysView.module.css';

const STATUS_TEXT = {
    complete: 'Completed',
    missed: 'Missed',
    rest: 'Rest day',
    scheduled: 'Scheduled',
};

function OccurrenceSummary({ rootId, occurrence }) {
    const status = occurrenceStatus(occurrence);
    const sessions = occurrence.sessions || [];
    return (
        <div className={styles.occurrenceSummary}>
            <ProgramDayStatusMark status={status} size="sm" decorative />
            <span className={styles.occurrenceStatus}>
                {STATUS_TEXT[status]}
                {occurrence.manual_status ? ' (set manually)' : ''}
            </span>
            {sessions.length ? (
                <span className={styles.occurrenceSessions}>
                    {' · '}
                    {sessions.map((session, index) => (
                        <React.Fragment key={session.id}>
                            {index > 0 ? ', ' : null}
                            <Link to={`/${rootId}/session/${session.id}`}>{session.name}</Link>
                        </React.Fragment>
                    ))}
                </span>
            ) : null}
        </div>
    );
}

/**
 * One occurrence date of a program day under its own date rail: its status, sessions, and
 * the plans on the day. Required templates are always open; optional ones wait in a selector
 * until loaded into the date. A past date with no sessions has no evidence to show, so it
 * shows neither plans nor logged work.
 */
export default function PlanDateColumn({
    rootId,
    programId,
    dayId,
    occurrence,
    caption,
    rail = null,
    today,
    timezone = 'UTC',
    activityById,
    circuitById,
    activities,
    circuits,
    activityGroups,
}) {
    const { date } = occurrence;
    const isEmptyPast = date < today && !(occurrence.sessions || []).length;
    const plansQuery = useProgramDayPlans(rootId, programId, dayId, isEmptyPast ? null : date, timezone);
    const mutations = useProgramSessionPlanMutations(rootId, programId, dayId, date, timezone);
    const headingId = `plan-column-${date}`;
    const readOnly = date < today;
    const entries = plansQuery.data?.plans || [];
    // Older payloads have no is_loaded: every template stays open, as before.
    const dayEntries = entries.filter((entry) => entry.is_loaded ?? true);
    const unloadedOptional = readOnly ? [] : entries.filter((entry) => !(entry.is_loaded ?? true));

    // Move focus to a card after it is added, and back to the selector after a removal. The
    // write updates the cached plans, so the render that shows the target runs this effect.
    const selectorHeadingRef = useRef(null);
    const pendingFocusRef = useRef(null);
    const setFocusTarget = (target) => { pendingFocusRef.current = target; };
    useEffect(() => {
        const target = pendingFocusRef.current;
        if (!target) return;
        const element = target === 'selector'
            ? selectorHeadingRef.current
            : document.getElementById(planCardElementId(target, date));
        if (element) {
            element.focus();
            pendingFocusRef.current = null;
        }
    });

    return (
        <section className={styles.column} aria-labelledby={headingId} data-align-column>
            {rail}
            {/* The rail's highlighted chip already shows the date and its status, and logged
                cards link their sessions; the header stays for screen readers and region names. */}
            <header className={styles.visuallyHidden}>
                <span>{caption}</span>
                <h3 id={headingId}>
                    {formatLiteralDate(date, { weekday: 'long', month: 'short', day: 'numeric', year: undefined })}
                </h3>
                <OccurrenceSummary rootId={rootId} occurrence={occurrence} />
            </header>
            {isEmptyPast ? (
                <article className={styles.planCard} aria-label="No sessions logged">
                    <EmptyState
                        compact
                        title="No sessions logged"
                        description="Nothing was recorded for this program day."
                    />
                </article>
            ) : null}
            {plansQuery.isLoading ? <p className={styles.state} aria-busy="true">Loading plans…</p> : null}
            {plansQuery.error ? (
                <p className={styles.state} role="alert">
                    Plans could not be loaded. <button type="button" onClick={() => plansQuery.refetch()}>Retry</button>
                </p>
            ) : null}
            {dayEntries.map((entry) => (entry.logged_sessions?.length
                // A completed template shows its session in the plan card layout.
                ? entry.logged_sessions.map((session, index) => (
                    <CompletedSessionCard
                        key={`${entry.template.id}:${session.id}`}
                        // One session per template lines up with its plan; keys must stay unique.
                        alignmentPrefix={index === 0 ? entry.template.id : null}
                        rootId={rootId}
                        sessionId={session.id}
                        template={entry.template}
                        activities={activities}
                    />
                ))
                : (
                    <SessionPlanCard
                        key={`${entry.template.id}:${entry.date}:${entry.plan_id || 'seed'}:${entry.row_version || 0}:${entry.source}`}
                        elementId={planCardElementId(entry.template.id, date)}
                        rootId={rootId}
                        entry={entry}
                        activityById={activityById}
                        circuitById={circuitById}
                        activities={activities}
                        circuits={circuits}
                        activityGroups={activityGroups}
                        mutations={mutations}
                        // Past program days keep the plan they had; only upcoming ones are edited.
                        readOnly={readOnly}
                        onRemoved={() => setFocusTarget('selector')}
                    />
                )))}
            <OptionalTemplateSelector
                entries={unloadedOptional}
                mutations={mutations}
                headingRef={selectorHeadingRef}
                onLoaded={(templateId) => setFocusTarget(templateId)}
            />
        </section>
    );
}
