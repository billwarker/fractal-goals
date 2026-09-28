import React, { useEffect, useRef } from 'react';

import { formatLiteralDate } from '../../../utils/dateUtils';
import { occurrenceStatus } from '../../../utils/programDaysView';
import ProgramDayStatusMark from '../ProgramDayStatusMark';
import styles from './ProgramDaysView.module.css';

const STATUS_LABEL = {
    complete: 'completed',
    missed: 'missed',
    rest: 'rest day',
    scheduled: 'scheduled',
};

/** Whether any template on this date has a stored (not just seeded) plan. */
export function hasStoredPlan(occurrence) {
    return occurrence.templates.some((template) => template.state === 'planned' || template.state === 'executed');
}

/**
 * One column's date rail: a single scrolling line of a program day's dates with their
 * canonical status marks. `blockedDate` is the date the other column shows; picking it
 * swaps the two columns (the caller decides), and the arrows step past it.
 */
export default function PlanOccurrenceStrip({
    occurrences,
    selectedDate,
    blockedDate = null,
    today,
    onSelect,
    label = 'Dates this day occurs',
}) {
    const selectedRef = useRef(null);
    const selectable = occurrences.filter((occurrence) => occurrence.date !== blockedDate);
    const selectedIndex = selectable.findIndex((occurrence) => occurrence.date === selectedDate);

    useEffect(() => {
        selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }, [selectedDate]);

    return (
        <div className={styles.strip}>
            <button
                type="button"
                className={styles.stripArrow}
                onClick={() => onSelect(selectable[selectedIndex - 1].date)}
                disabled={selectedIndex <= 0}
                aria-label={`${label}: previous date`}
            >‹</button>
            <ol className={styles.stripDates} aria-label={label}>
                {occurrences.map((occurrence) => {
                    const status = occurrenceStatus(occurrence);
                    const planned = hasStoredPlan(occurrence);
                    const selected = occurrence.date === selectedDate;
                    const blocked = occurrence.date === blockedDate;
                    const isToday = occurrence.date === today;
                    return (
                        <li key={occurrence.date}>
                            <button
                                ref={selected ? selectedRef : null}
                                type="button"
                                className={[
                                    styles.stripDate,
                                    isToday ? styles.stripToday : '',
                                    blocked ? styles.stripBlocked : '',
                                ].filter(Boolean).join(' ')}
                                aria-pressed={selected}
                                title={formatLiteralDate(occurrence.date, { weekday: 'long', month: 'long', day: 'numeric' })}
                                aria-label={[
                                    formatLiteralDate(occurrence.date, { weekday: 'long' }),
                                    STATUS_LABEL[status],
                                    planned ? 'planned' : 'not planned yet',
                                    isToday ? 'today' : null,
                                    blocked ? 'shown in the other column, choose to swap' : null,
                                ].filter(Boolean).join(', ')}
                                onClick={() => onSelect(occurrence.date)}
                            >
                                <span>{isToday ? 'Today' : formatLiteralDate(occurrence.date, { year: undefined })}</span>
                                <span className={styles.stripStatus}>
                                    <ProgramDayStatusMark status={status} size="sm" decorative />
                                    {planned ? <span className={styles.stripPlanned} title="Planned" aria-hidden="true" /> : null}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            <button
                type="button"
                className={styles.stripArrow}
                onClick={() => onSelect(selectable[selectedIndex + 1].date)}
                disabled={selectedIndex < 0 || selectedIndex >= selectable.length - 1}
                aria-label={`${label}: next date`}
            >›</button>
        </div>
    );
}
