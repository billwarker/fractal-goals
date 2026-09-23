import React from 'react';

import { formatLiteralDate } from '../../utils/dateUtils';
import { CALENDAR_PERIOD_KIND_LABELS } from '../../utils/programDayState';
import styles from './ProgramSidePane.module.css';

const SHORT_DATE = { year: undefined, month: 'short', day: 'numeric' };

/** Explains how a calendar event covering this date affected it. */
export default function ProgramDayPeriodBanner({ period, excused, metWhileAway, onEdit }) {
    const kind = CALENDAR_PERIOD_KIND_LABELS[period.kind] || CALENDAR_PERIOD_KIND_LABELS.other;
    let explanation = 'This event is informational; it does not change streaks.';
    if (period.protects_streaks) {
        if (excused) explanation = 'Scheduled work wasn’t completed; this day counts as rest.';
        else if (metWhileAway) explanation = 'Completed during this event — counts toward your streak.';
        else explanation = 'Scheduled days here won’t break your streak.';
    }
    return (
        <section className={styles.periodBanner} aria-label={`${kind}: ${period.name}`}>
            <div className={styles.periodBannerHeading}>
                <strong>{kind} · {period.name}</strong>
                {onEdit ? (
                    <button type="button" className={styles.quietAction} onClick={() => onEdit(period)}>Edit</button>
                ) : null}
            </div>
            <span className={styles.periodBannerMeta}>
                {formatLiteralDate(period.start_date, SHORT_DATE)} – {formatLiteralDate(period.end_date, SHORT_DATE)}
                {period.protects_streaks ? ' · Protecting streaks' : ''}
            </span>
            <p className={styles.explainer}>{explanation}</p>
        </section>
    );
}
