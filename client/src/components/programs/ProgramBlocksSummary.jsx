import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './ProgramBlocksSummary.module.css';

const SHORT_DATE = { year: undefined, month: 'short', day: 'numeric' };
const formatPercent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;

function blockStatus(block, today) {
    const start = block.start_date?.slice(0, 10);
    const end = block.end_date?.slice(0, 10);
    if (!start || !end || !today) return null;
    if (today < start) return 'Upcoming';
    if (today > end) return 'Finished';
    return 'Current';
}

/**
 * The Blocks view's side pane: every block's results over the whole program, independent of
 * whatever date or range the calendar view has selected.
 */
export default function ProgramBlocksSummary({ metrics, loading = false, error = null, today = null }) {
    const blocks = useMemo(() => (
        [...(metrics?.blocks || [])].sort((left, right) => (
            (left.start_date || '').localeCompare(right.start_date || '')
            || (left.end_date || '').localeCompare(right.end_date || '')
            || String(left.name || '').localeCompare(String(right.name || ''))
        ))
    ), [metrics]);

    if (loading) return <div className={styles.state} aria-busy="true">Loading block results…</div>;
    if (error) return <div className={styles.state} role="alert">Block results could not be loaded. Try again shortly.</div>;
    if (!metrics) return <div className={styles.state}>Block results are not available yet.</div>;

    return (
        <section className={styles.summary} aria-labelledby="program-blocks-summary-title">
            <div className={styles.heading}>
                <h2 id="program-blocks-summary-title">Blocks</h2>
                <span>{blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}</span>
            </div>
            {blocks.length ? (
                <ol className={styles.blockList}>
                    {blocks.map((block) => {
                        const status = blockStatus(block, today);
                        return (
                            <li key={block.block_id} className={styles.blockRow} aria-label={block.name}>
                                <div className={styles.blockHeader}>
                                    <div className={styles.blockName}>
                                        <span className={styles.blockMarker} style={block.color ? { background: block.color } : undefined} aria-hidden="true" />
                                        <span>{block.name}</span>
                                        {status ? <span className={styles.blockStatus}>{status}</span> : null}
                                    </div>
                                    {block.start_date && block.end_date ? (
                                        <span className={styles.blockDates}>
                                            {formatLiteralDate(block.start_date, SHORT_DATE)} – {formatLiteralDate(block.end_date, SHORT_DATE)}
                                        </span>
                                    ) : null}
                                </div>
                                <dl className={styles.blockMetrics}>
                                    <div>
                                        <dt>Met / scheduled</dt>
                                        <dd>{block.adherence.met_days} / {block.adherence.scheduled_days_observed}</dd>
                                    </div>
                                    <div>
                                        <dt>Alignment</dt>
                                        <dd>{formatPercent(block.alignment.duration_seconds.rate)}</dd>
                                    </div>
                                    <div>
                                        <dt>Linked sessions</dt>
                                        <dd>{block.linked_sessions}</dd>
                                    </div>
                                </dl>
                                {(block.program_days || []).length ? (
                                    <div className={styles.programDays}>
                                        <div className={styles.programDaysHeading}>
                                            <span>Program days</span>
                                            <span>Completed / scheduled</span>
                                        </div>
                                        <ul>
                                            {block.program_days.map((day) => (
                                                <li key={day.program_day_id}>
                                                    <span title={day.name}>{day.name}</span>
                                                    <strong>{day.completed_occurrences} / {day.scheduled_occurrences}</strong>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ol>
            ) : <p className={styles.empty}>This program has no blocks yet.</p>}
        </section>
    );
}

ProgramBlocksSummary.propTypes = {
    metrics: PropTypes.object,
    loading: PropTypes.bool,
    error: PropTypes.object,
    today: PropTypes.string,
};
