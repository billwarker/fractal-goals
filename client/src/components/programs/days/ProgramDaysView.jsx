import React, { useEffect, useMemo, useRef } from 'react';

import EmptyState from '../../common/EmptyState';
import useAlignedColumns from '../../../hooks/useAlignedColumns';
import { useCircuits } from '../../../hooks/useCircuitQueries';
import { formatLiteralDate } from '../../../utils/dateUtils';
import {
    describeOccurrenceDate,
    occurrenceStatus,
    pickColumnDate,
    planCardElementId,
} from '../../../utils/programDaysView';
import PlanDateColumn from './PlanDateColumn';
import PlanOccurrenceStrip from './PlanOccurrenceStrip';
import { plannableDayGroups } from './ProgramDaysNavigator';
import styles from './ProgramDaysView.module.css';

/**
 * Programs page Days tab main area: one date column under its own rail, by default the next
 * program day. With compare on (a side-pane toggle), a left column joins it with its own
 * rail, by default the latest completed day before it, so the user programs each week from
 * what they actually did. The day selector lives in the side pane; narrow screens get a day
 * select here instead. Plans are reference values.
 */
export default function ProgramDaysView({
    rootId,
    program,
    blocks,
    activities,
    activityGroups,
    today,
    timezone = 'UTC',
    resolved,
    occurrencesQuery,
    focusTemplateId = null,
    onSelectionChange,
    showDateControls = false,
}) {
    const { found, occurrences, date, compareDate, columnDates } = resolved;
    const occurrenceDates = useMemo(() => occurrences.map((occurrence) => occurrence.date), [occurrences]);
    const occurrenceByDate = useMemo(
        () => new Map(occurrences.map((occurrence) => [occurrence.date, occurrence])),
        [occurrences],
    );
    const { data: circuits = [] } = useCircuits(rootId);
    // Matching templates, sections, and activities line up across the two columns.
    const columnsRef = useRef(null);
    useAlignedColumns(columnsRef, [columnDates.join(','), found?.day.id]);
    const activityById = useMemo(
        () => new Map((activities || []).map((activity) => [activity.id, activity])),
        [activities],
    );
    const circuitById = useMemo(
        () => new Map((circuits || []).map((circuit) => [circuit.id, circuit])),
        [circuits],
    );
    const announcement = columnDates.length
        ? `Showing plans for ${columnDates.map((value) => formatLiteralDate(value, { weekday: 'long' })).join(' and ')}`
        : '';

    useEffect(() => {
        if (!focusTemplateId || !date) return undefined;
        // The focused date's card mounts once its plans load; poll briefly for it.
        let attempts = 0;
        const timer = window.setInterval(() => {
            const card = document.getElementById(planCardElementId(focusTemplateId, date));
            attempts += 1;
            if (!card && attempts < 20) return;
            window.clearInterval(timer);
            card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            card?.focus?.({ preventScroll: true });
        }, 100);
        return () => window.clearInterval(timer);
    }, [focusTemplateId, date]);

    if (!found) {
        return (
            <EmptyState
                title="No program days to plan"
                description="Add a program day with at least one session template, then plan its sessions here."
            />
        );
    }

    return (
        <section className={styles.main} aria-labelledby="program-days-title">
            {showDateControls ? (
                <label className={styles.daySelect}>
                    <span className={styles.visuallyHidden}>Program day</span>
                    <select
                        value={found.day.id}
                        onChange={(event) => onSelectionChange({ dayId: event.target.value, date: null })}
                    >
                        {plannableDayGroups(blocks).map(({ block, days }) => (
                            <optgroup key={block.id} label={block.name}>
                                {days.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </label>
            ) : null}
            {/* The highlighted day in the side pane names the selection on desktop; keep the
                heading for screen readers and show it where the side pane is a hidden sheet. */}
            <header className={showDateControls ? styles.mainHeader : styles.visuallyHidden}>
                <span className={styles.mainHeaderBlock} style={{ color: found.block.color || undefined }}>
                    {found.block.name}
                </span>
                <span className={styles.mainHeaderDivider} aria-hidden="true">/</span>
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
            {columnDates.length ? (
                <div className={`${styles.columns} ${compareDate ? '' : styles.columnsSingle}`} ref={columnsRef}>
                    {columnDates.map((value) => (
                        <PlanDateColumn
                            key={value === date ? 'focus' : 'compare'}
                            rail={(
                                <PlanOccurrenceStrip
                                    occurrences={occurrences}
                                    selectedDate={value}
                                    blockedDate={value === date ? compareDate : date}
                                    today={today}
                                    label={!compareDate ? 'Program day dates'
                                        : value === date ? 'Right column dates' : 'Left column dates'}
                                    onSelect={(nextDate) => onSelectionChange((current) => ({
                                        ...current,
                                        dayId: found.day.id,
                                        templateId: null,
                                        ...pickColumnDate({ isFocus: value === date, nextDate, date, compareDate }),
                                    }))}
                                />
                            )}
                            rootId={rootId}
                            programId={program.id}
                            dayId={found.day.id}
                            occurrence={occurrenceByDate.get(value)}
                            caption={describeOccurrenceDate(value, occurrenceDates, today, {
                                completed: occurrenceStatus(occurrenceByDate.get(value)) === 'complete',
                                isComparison: columnDates.length > 1 && value === columnDates[0],
                            })}
                            today={today}
                            timezone={timezone}
                            activityById={activityById}
                            circuitById={circuitById}
                            activities={activities}
                            circuits={circuits}
                            activityGroups={activityGroups}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
