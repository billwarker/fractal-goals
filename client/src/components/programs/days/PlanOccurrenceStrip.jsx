import React, { useEffect, useRef } from 'react';

import { formatLiteralDate } from '../../../utils/dateUtils';
import styles from './ProgramDaysView.module.css';

const STATE_LABEL = {
    executed: 'done',
    planned: 'planned',
    seeded: 'not planned yet',
};

/** The strongest state across a date's templates drives its marker. */
export function summarizeOccurrence(occurrence) {
    const states = occurrence.templates.map((template) => template.state);
    if (states.length && states.every((state) => state === 'executed')) return 'executed';
    if (states.some((state) => state === 'planned' || state === 'executed')) return 'planned';
    return 'seeded';
}

export default function PlanOccurrenceStrip({ occurrences, selectedDate, today, onSelect }) {
    const selectedRef = useRef(null);
    const selectedIndex = occurrences.findIndex((occurrence) => occurrence.date === selectedDate);

    useEffect(() => {
        selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }, [selectedDate]);

    return (
        <div className={styles.strip}>
            <button
                type="button"
                className={styles.stripArrow}
                onClick={() => onSelect(occurrences[selectedIndex - 1].date)}
                disabled={selectedIndex <= 0}
                aria-label="Previous date"
            >‹</button>
            <ol className={styles.stripDates} aria-label="Dates this day occurs">
                {occurrences.map((occurrence) => {
                    const state = summarizeOccurrence(occurrence);
                    const selected = occurrence.date === selectedDate;
                    return (
                        <li key={occurrence.date}>
                            <button
                                ref={selected ? selectedRef : null}
                                type="button"
                                className={`${styles.stripDate} ${occurrence.date === today ? styles.stripToday : ''}`}
                                aria-pressed={selected}
                                aria-label={`${formatLiteralDate(occurrence.date, { weekday: 'long' })}, ${STATE_LABEL[state]}${occurrence.date === today ? ', today' : ''}`}
                                onClick={() => onSelect(occurrence.date)}
                            >
                                <span className={styles.stripWeekday}>
                                    {formatLiteralDate(occurrence.date, { weekday: 'short', year: undefined, month: undefined, day: undefined })}
                                </span>
                                <span>{formatLiteralDate(occurrence.date, { year: undefined })}</span>
                                <span className={`${styles.stripMarker} ${styles[`marker_${state}`]}`} aria-hidden="true" />
                            </button>
                        </li>
                    );
                })}
            </ol>
            <button
                type="button"
                className={styles.stripArrow}
                onClick={() => onSelect(occurrences[selectedIndex + 1].date)}
                disabled={selectedIndex < 0 || selectedIndex >= occurrences.length - 1}
                aria-label="Next date"
            >›</button>
        </div>
    );
}
