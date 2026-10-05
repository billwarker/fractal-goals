import React, { useId } from 'react';
import PropTypes from 'prop-types';

import { formatLiteralDate } from '../../utils/dateUtils';
import { blockWeeks, WEEK_START_OPTIONS } from '../../utils/programBlockWeeks';
import styles from './ProgramBlockModal.module.css';

const shortDate = (value) => formatLiteralDate(value, { year: undefined });

/** "Week 1: Sep 1 – 5 (partial) · 5 weeks", for the dates and start day being edited. */
export function weekTrackingPreview(startDate, endDate, weekStartDay) {
    const weeks = blockWeeks(startDate, endDate, weekStartDay);
    if (!weeks.length) return '';
    const [first] = weeks;
    const range = first.start === first.end ? shortDate(first.start) : `${shortDate(first.start)} – ${shortDate(first.end)}`;
    return `Week 1: ${range}${first.partial ? ' (partial)' : ''} · ${weeks.length} week${weeks.length === 1 ? '' : 's'}`;
}

/**
 * Track weeks inside a block. Week 1 starts on the block's start date; every later week
 * starts on the chosen weekday so the numbers line up with the calendar's rows.
 */
export default function BlockWeekTrackingField({ startDate, endDate, trackWeeks, weekStartDay, onChange }) {
    const id = useId();
    const preview = trackWeeks ? weekTrackingPreview(startDate, endDate, weekStartDay) : '';
    return (
        <div className={styles.field}>
            <label className={styles.checkboxRow} htmlFor={`${id}-track`}>
                <input
                    id={`${id}-track`}
                    type="checkbox"
                    checked={trackWeeks}
                    onChange={(event) => onChange({ trackWeeks: event.target.checked, weekStartDay })}
                    aria-describedby={`${id}-help`}
                />
                <span>Track weeks</span>
            </label>
            <span id={`${id}-help`} className={styles.dateHint}>
                Numbers Week 1, 2, 3… across the block on the calendar.
            </span>
            {trackWeeks ? (
                <fieldset className={styles.weekStartFieldset}>
                    <legend className={styles.colorLabel}>Weeks start on</legend>
                    <div className={styles.weekStartOptions}>
                        {WEEK_START_OPTIONS.map((option) => (
                            <label key={option.value} className={styles.weekStartOption}>
                                <input
                                    type="radio"
                                    name={`${id}-week-start`}
                                    value={option.value}
                                    checked={weekStartDay === option.value}
                                    onChange={() => onChange({ trackWeeks, weekStartDay: option.value })}
                                    aria-label={option.label}
                                />
                                <span aria-hidden="true">{option.short}</span>
                            </label>
                        ))}
                    </div>
                    {preview ? <span className={styles.weekPreview} aria-live="polite">{preview}</span> : null}
                </fieldset>
            ) : null}
        </div>
    );
}

BlockWeekTrackingField.propTypes = {
    startDate: PropTypes.string,
    endDate: PropTypes.string,
    trackWeeks: PropTypes.bool.isRequired,
    weekStartDay: PropTypes.number,
    onChange: PropTypes.func.isRequired,
};
