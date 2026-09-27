import React, { useMemo } from 'react';

import EmptyState from '../../common/EmptyState';
import { useCircuits } from '../../../hooks/useCircuitQueries';
import {
    useProgramDayPlans,
    useProgramPlanOccurrences,
    useProgramSessionPlanMutations,
} from '../../../hooks/useProgramSessionPlans';
import { formatLiteralDate } from '../../../utils/dateUtils';
import PlanOccurrenceStrip from './PlanOccurrenceStrip';
import ProgramDaysNavigator from './ProgramDaysNavigator';
import SessionPlanCard from './SessionPlanCard';
import styles from './ProgramDaysView.module.css';

function findDay(blocks, dayId) {
    for (const block of blocks) {
        const day = (block.days || []).find((candidate) => String(candidate.id) === String(dayId));
        if (day) return { block, day };
    }
    return null;
}

/** First day with templates in the block covering today, else the first such day. */
export function pickDefaultDayId(blocks, today) {
    const plannable = (block) => (block.days || []).find((day) => (day.templates || []).length > 0);
    const current = blocks.find((block) => (
        (!block.start_date || block.start_date <= today) && (!block.end_date || today <= block.end_date)
    ));
    const day = (current && plannable(current)) || blocks.map(plannable).find(Boolean);
    return day?.id || null;
}

/** The first date on or after today, else the last date. */
export function pickDefaultDate(dates, today) {
    if (!dates.length) return null;
    return (dates.find((value) => value >= today) || dates[dates.length - 1]);
}

/**
 * Programs page Days tab: choose a program day and one of its dates, then program each
 * of that date's templates side by side. Plans are reference values for the session.
 */
export default function ProgramDaysView({
    rootId,
    program,
    blocks,
    activities,
    activityGroups,
    today,
    selection,
    onSelectionChange,
}) {
    const dayId = selection?.dayId || pickDefaultDayId(blocks, today);
    const found = dayId ? findDay(blocks, dayId) : null;
    const occurrencesQuery = useProgramPlanOccurrences(rootId, program.id, found?.day.id);
    const occurrences = useMemo(() => occurrencesQuery.data?.dates || [], [occurrencesQuery.data]);
    const occurrenceDates = useMemo(() => occurrences.map((occurrence) => occurrence.date), [occurrences]);
    const requestedDate = selection?.date && occurrenceDates.includes(selection.date) ? selection.date : null;
    const date = requestedDate || pickDefaultDate(occurrenceDates, today);
    const plansQuery = useProgramDayPlans(rootId, program.id, found?.day.id, date);
    const mutations = useProgramSessionPlanMutations(rootId, program.id, found?.day.id, date);
    const { data: circuits = [] } = useCircuits(rootId);
    const activityById = useMemo(
        () => new Map((activities || []).map((activity) => [activity.id, activity])),
        [activities],
    );
    const announcement = date ? `Showing plans for ${formatLiteralDate(date, { weekday: 'long' })}` : '';

    if (!found) {
        return (
            <EmptyState
                title="No program days to plan"
                description="Add a program day with at least one session template, then plan its sessions here."
            />
        );
    }

    const select = (next) => onSelectionChange({ dayId: found.day.id, date, ...next });

    return (
        <div className={styles.layout}>
            <ProgramDaysNavigator
                blocks={blocks}
                selectedDayId={found.day.id}
                onSelect={(nextDayId) => onSelectionChange({ dayId: nextDayId, date: null })}
            />
            <section className={styles.main} aria-labelledby="program-days-title">
                <header className={styles.mainHeader}>
                    <small style={{ color: found.block.color || undefined }}>{found.block.name}</small>
                    <h2 id="program-days-title">{found.day.name}</h2>
                </header>
                <p className={styles.visuallyHidden} aria-live="polite">{announcement}</p>
                {occurrencesQuery.isLoading ? <p className={styles.state} aria-busy="true">Loading dates…</p> : null}
                {occurrencesQuery.error ? (
                    <p className={styles.state} role="alert">
                        Dates could not be loaded. <button type="button" onClick={() => occurrencesQuery.refetch()}>Retry</button>
                    </p>
                ) : null}
                {!occurrencesQuery.isLoading && !occurrencesQuery.error && !occurrences.length ? (
                    <EmptyState
                        compact
                        title="Not scheduled yet"
                        description="Give this day weekdays or specific dates within its block to plan its sessions."
                    />
                ) : null}
                {occurrences.length ? (
                    <PlanOccurrenceStrip
                        occurrences={occurrences}
                        selectedDate={date}
                        today={today}
                        onSelect={(nextDate) => select({ date: nextDate })}
                    />
                ) : null}
                {date && plansQuery.isLoading ? <p className={styles.state} aria-busy="true">Loading plans…</p> : null}
                {date && plansQuery.error ? (
                    <p className={styles.state} role="alert">
                        Plans could not be loaded. <button type="button" onClick={() => plansQuery.refetch()}>Retry</button>
                    </p>
                ) : null}
                {plansQuery.data ? (
                    <div className={styles.cards}>
                        {plansQuery.data.plans.map((entry) => (
                            <SessionPlanCard
                                key={`${entry.template.id}:${entry.date}:${entry.plan_id || 'seed'}:${entry.row_version || 0}:${entry.source}`}
                                rootId={rootId}
                                entry={entry}
                                activityById={activityById}
                                activities={activities}
                                circuits={circuits}
                                activityGroups={activityGroups}
                                mutations={mutations}
                                readOnly={entry.executed_sessions.length > 0 && date < today}
                            />
                        ))}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
