import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';

import { formatLiteralDate } from '../../utils/dateUtils';
import {
    formatSpecificDatesSummary,
    formatWeekdaySchedule,
    WEEKDAY_NAMES,
} from '../../utils/programViewModel';
import styles from './ProgramDayModal.module.css';
import Input from '../atoms/Input';
import Tooltip from '../atoms/Tooltip';

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
    takenWeekdays = new Map(), occupiedDates = new Map(),
    repeatEveryWeeks = 1, onRepeatEveryWeeksChange,
}) {
    const [draftDate, setDraftDate] = useState('');
    const groupId = useId();
    const dateInputId = useId();
    const draftOwner = draftDate ? occupiedDates.get(draftDate) : null;
    const inRange = draftDate
        && (!minDate || draftDate >= minDate)
        && (!maxDate || draftDate <= maxDate)
        && !draftOwner;

    const addDraftDate = () => {
        if (!inRange) return;
        onAddDate(draftDate);
        setDraftDate('');
    };

    return (
        <div className={styles.field} role="group" aria-labelledby={`${groupId}-label`}>
            <div className={styles.scheduleRow}>
              <div className={styles.scheduleToggle}>
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
              </div>
              {mode === SCHEDULE_MODES.weekly ? (
                  <Input label="Repeat every (weeks)" type="number" min="1" max="2147483647" step="1"
                      value={repeatEveryWeeks} placeholder="1" className={styles.intervalField}
                      onChange={(event) => onRepeatEveryWeeksChange?.(event.target.value)} />
              ) : null}
            </div>

            {mode === SCHEDULE_MODES.weekly ? (
                <>
                    <div className={styles.dayGrid}>
                        {WEEKDAY_NAMES.map((name) => {
                            const selected = weekdays.includes(name);
                            // A taken weekday stays enabled while selected so it can be cleared.
                            const owner = takenWeekdays.get(name);
                            const taken = Boolean(owner) && !selected;
                            return (
                                <Tooltip key={name} portal label={owner ? `Taken by ${owner}` : null}>
                                  <button
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={owner ? `${name}, taken by ${owner}` : name}
                                    aria-disabled={taken}
                                    onClick={() => { if (!taken) onToggleWeekday(name); }}
                                    className={`${styles.dayBtn} ${selected ? styles.dayBtnSelected : ''} ${owner ? styles.dayBtnTaken : ''}`}
                                  >{name.slice(0, 3)}</button>
                                </Tooltip>
                            );
                        })}
                    </div>
                    <div className={styles.hint}>
                        {weekdays.length
                            ? formatWeekdaySchedule(weekdays, Number(repeatEveryWeeks || 1))
                            : 'No repeating days. Plan it on individual dates from the calendar.'}
                    </div>
                    {Number(repeatEveryWeeks) > 1 ? <div className={styles.hint}>Repeats from the program’s first week (Monday–Sunday).</div> : null}
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
                        {draftOwner
                            ? `${formatLiteralDate(draftDate, { weekday: 'short' })} already has ${draftOwner}.`
                            : dates.length
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
    /** Weekday name -> the other program day that already holds a date on it. */
    takenWeekdays: PropTypes.instanceOf(Map),
    /** ISO date -> the other program day that already holds it. */
    occupiedDates: PropTypes.instanceOf(Map),
    repeatEveryWeeks: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onRepeatEveryWeeksChange: PropTypes.func,
};
