import React from 'react';
import PropTypes from 'prop-types';

import styles from './ProgramBlockModal.module.css';

const DAY_MS = 86400000;

function toTime(value) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

/** Whole weeks a block spans, counting a partial last week. */
export function blockLengthInWeeks(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) return '';
    return Math.ceil(((toTime(endDate) - toTime(startDate)) / DAY_MS + 1) / 7);
}

/** The end date of a block of ``weeks`` weeks from ``startDate``, kept inside the program. */
export function endDateForWeeks(startDate, weeks, programEnd) {
    const end = new Date(toTime(startDate) + (weeks * 7 - 1) * DAY_MS).toISOString().slice(0, 10);
    return programEnd && end > programEnd ? programEnd : end;
}

/** Block length in weeks: changing it moves the end date; editing the end date updates it. */
export default function BlockLengthField({ startDate, endDate, programEnd, onEndDateChange }) {
    return (
        <div className={styles.field}>
            <label className={styles.colorLabel} htmlFor="block-length-weeks">Length (weeks)</label>
            <input
                id="block-length-weeks"
                className={styles.numberInput}
                type="number"
                min={1}
                max={52}
                value={blockLengthInWeeks(startDate, endDate)}
                disabled={!startDate}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isInteger(next) && next >= 1) onEndDateChange(endDateForWeeks(startDate, next, programEnd));
                }}
            />
        </div>
    );
}

BlockLengthField.propTypes = {
    startDate: PropTypes.string,
    endDate: PropTypes.string,
    programEnd: PropTypes.string,
    onEndDateChange: PropTypes.func.isRequired,
};
