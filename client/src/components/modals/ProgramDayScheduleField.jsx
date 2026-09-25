import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';

import { formatLiteralDate } from '../../utils/dateUtils';
import {
    formatSpecificDatesSummary,
    formatWeekdaySchedule,
    WEEKDAY_NAMES,
} from '../../utils/programViewModel';
import styles from './ProgramDayModal.module.css';

export const SCHEDULE_MODES = { weekly: 'weekly', dates: 'dates' };

function DateChips({ dates, onRemove, label }) {
    return (
        <ul className={styles.dateChips} aria-label={label}>
            {dates.map((value) => {
                const text = formatLiteralDate(value, { weekday: 'short' });
                return (
                    <li key={value} className={styles.dateChip}>
                        <span>{text}</span>
                        <button
                            type="button"
                            className={styles.dateChipRemove}
                            onClick={() => onRemove(value)}
                            aria-label={`Remove ${text}`}
                        >&times;</button>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Weekly (days of week) or specific-date scheduling for one program-day
 * definition. Dates kept while in weekly mode are shown as extra planned dates.
 */
export default function ProgramDayScheduleField({
    mode, onModeChange, weekdays, onToggleWeekday, dates, onAddDate, onRemoveDate, minDate, maxDate,
}) {
    const [draftDate, setDraftDate] = useState('');
    const groupId = useId();
    const dateInputId = useId();
    const inRange = draftDate
        && (!minDate || draftDate >= minDate)
        && (!maxDate || draftDate <= maxDate);

    const addDraftDate = () => {
        if (!inRange) return;
        onAddDate(draftDate);
        setDraftDate('');
    };

    return (
        <div className={styles.field} role="group" aria-labelledby={`${groupId}-label`}>
            <span id={`${groupId}-label`} className={styles.label}>Schedule</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Schedule type">
                {[
                    [SCHEDULE_MODES.weekly, 'Weekly'],
                    [SCHEDULE_MODES.dates, 'Specific dates'],
                ].map(([value, text]) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={mode === value}
                        className={`${styles.segment} ${mode === value ? styles.segmentSelected : ''}`}
                        onClick={() => onModeChange(value)}
                    >{text}</button>
                ))}
            </div>

            {mode === SCHEDULE_MODES.weekly ? (
                <>
                    <div className={styles.dayGrid}>
                        {WEEKDAY_NAMES.map((name) => {
                            const selected = weekdays.includes(name);
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={name}
                                    onClick={() => onToggleWeekday(name)}
                                    className={`${styles.dayBtn} ${selected ? styles.dayBtnSelected : ''}`}
                                >{name.slice(0, 3)}</button>
                            );
                        })}
                    </div>
                    <div className={styles.hint}>
                        {weekdays.length
                            ? formatWeekdaySchedule(weekdays)
                            : 'No repeating days. Plan it on individual dates from the calendar.'}
                    </div>
                    {dates.length ? (
                        <div className={styles.alsoPlanned}>
                            <span className={styles.label}>Also planned on</span>
                            <DateChips dates={dates} onRemove={onRemoveDate} label="Also planned on" />
                        </div>
                    ) : null}
                </>
            ) : (
                <>
                    {dates.length ? (
                        <DateChips dates={dates} onRemove={onRemoveDate} label="Scheduled dates" />
                    ) : null}
                    <div className={styles.addDateRow}>
                        <label htmlFor={dateInputId} className={styles.visuallyHidden}>Date to add</label>
                        <input
                            id={dateInputId}
                            type="date"
                            className={styles.dateInput}
                            value={draftDate}
                            min={minDate || undefined}
                            max={maxDate || undefined}
                            onChange={(event) => setDraftDate(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                addDraftDate();
                            }}
                        />
                        <button
                            type="button"
                            className={styles.addDateBtn}
                            disabled={!inRange}
                            onClick={addDraftDate}
                        >Add date</button>
                    </div>
                    <div className={styles.hint} aria-live="polite">
                        {dates.length
                            ? formatSpecificDatesSummary(dates)
                            : 'Add at least one date, or switch to Weekly.'}
                    </div>
                </>
            )}
        </div>
    );
}

ProgramDayScheduleField.propTypes = {
    mode: PropTypes.oneOf(Object.values(SCHEDULE_MODES)).isRequired,
    onModeChange: PropTypes.func.isRequired,
    weekdays: PropTypes.arrayOf(PropTypes.string).isRequired,
    onToggleWeekday: PropTypes.func.isRequired,
    dates: PropTypes.arrayOf(PropTypes.string).isRequired,
    onAddDate: PropTypes.func.isRequired,
    onRemoveDate: PropTypes.func.isRequired,
    minDate: PropTypes.string,
    maxDate: PropTypes.string,
};
