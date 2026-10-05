import React from 'react';
import PropTypes from 'prop-types';

import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './ProgramOverview.module.css';

const SHORT_DATE = { year: undefined, month: 'short', day: 'numeric' };
const formatPercent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;

/**
 * The calendar pane's program summary: headline metrics, overlapping events, then the
 * program's blocks. The goal hierarchy has its own Goals view in the side pane.
 */
export default function ProgramOverview({ metrics, loading = false, error = null, onEditPeriod = null, blocks = null }) {
    if (loading) return <div className={styles.state} aria-busy="true">Loading program overview…</div>;
    if (error) return <div className={styles.state} role="alert">Program overview could not be loaded. Try again shortly.</div>;
    if (!metrics) return <div className={styles.state}>Program overview is not available yet.</div>;

    const headlineMetrics = [
        [metrics.consistency.mode === 'density' ? 'Active-day density' : 'Consistency', formatPercent(metrics.consistency.rate)],
        ['Goals completed', `${metrics.outcomes.goals_completed_in_window} / ${metrics.outcomes.goals_in_scope}`],
        ['Current streak', `${metrics.consistency.current_streak} ${metrics.consistency.current_streak === 1 ? 'day' : 'days'}`],
        ['Program progress', formatPercent(
            metrics.window.is_partial
                ? (metrics.window.total_days ? metrics.window.observed_days / metrics.window.total_days : null)
                : metrics.program.progress.rate
        )],
    ];

    return (
        <div
            className={styles.overview}
            aria-label={metrics.window.is_partial ? 'Selected timeframe program overview' : 'Full program overview'}
        >
            <dl className={styles.stats} aria-label="Program metrics">
                {headlineMetrics.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>

            {metrics.periods?.length || metrics.consistency.period_rest_days ? (
                <section className={styles.section} aria-labelledby="program-time-off-title">
                    <div className={styles.sectionHeading}>
                        <h2 id="program-time-off-title">Events</h2>
                    </div>
                    {metrics.consistency.period_rest_days ? (
                        <p className={styles.timeOffSummary}>
                            {metrics.consistency.period_rest_days} {metrics.consistency.period_rest_days === 1 ? 'day' : 'days'} protected
                            by events; they don’t count against consistency or break your streak.
                        </p>
                    ) : null}
                    <ul className={styles.timeOffList}>
                        {(metrics.periods || []).map((period) => {
                            const content = (
                                <>
                                    <strong>{period.name}</strong>
                                    <span>{formatLiteralDate(period.start_date, SHORT_DATE)} – {formatLiteralDate(period.end_date, SHORT_DATE)}</span>
                                    {period.protects_streaks ? null : <small>Not protecting streaks</small>}
                                </>
                            );
                            return (
                                <li key={period.id}>
                                    {onEditPeriod ? (
                                        <button
                                            type="button"
                                            className={styles.timeOffItem}
                                            onClick={() => onEditPeriod(period)}
                                            aria-label={`Edit event ${period.name}`}
                                        >{content}</button>
                                    ) : <div className={styles.timeOffItem}>{content}</div>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : null}

            {blocks ? (
                <section className={styles.section} aria-labelledby="program-blocks-title">
                    <div className={styles.sectionHeading}>
                        <h2 id="program-blocks-title">Blocks</h2>
                    </div>
                    {blocks}
                </section>
            ) : null}

        </div>
    );
}

ProgramOverview.propTypes = {
    metrics: PropTypes.object,
    loading: PropTypes.bool,
    error: PropTypes.object,
    onEditPeriod: PropTypes.func,
    blocks: PropTypes.node,
};
