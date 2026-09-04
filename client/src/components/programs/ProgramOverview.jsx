import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalIcon from '../atoms/GoalIcon';
import styles from './ProgramOverview.module.css';

const formatPercent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;
const formatEffortShare = (value) => value > 0 && value < 0.01 ? '<1%' : formatPercent(value);

function isInObservedWindow(block, windowData) {
    const startDate = block.start_date?.slice(0, 10);
    const endDate = block.end_date?.slice(0, 10);
    const windowStart = windowData?.display_start?.slice(0, 10);
    const windowEnd = [windowData?.display_end?.slice(0, 10), windowData?.as_of?.slice(0, 10)]
        .filter(Boolean)
        .sort()[0];
    if (startDate && windowEnd) {
        return startDate <= windowEnd && (!endDate || !windowStart || endDate >= windowStart);
    }
    return Boolean(block.adherence?.scheduled_days_observed || block.linked_sessions);
}

export default function ProgramOverview({ metrics, loading = false, error = null }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const goalCoverage = useMemo(() => (
        [...(metrics?.goal_coverage || [])]
            .filter((goal) => goal.effort_share > 0)
            .sort((left, right) => (
                (right.effort_share || 0) - (left.effort_share || 0)
                || String(left.name || '').localeCompare(String(right.name || ''))
            ))
    ), [metrics]);
    const blocksInScope = useMemo(() => (
        (metrics?.blocks || [])
            .filter((block) => isInObservedWindow(block, metrics?.window))
            .sort((left, right) => (
                (left.start_date || '').localeCompare(right.start_date || '')
                || (left.end_date || '').localeCompare(right.end_date || '')
                || String(left.name || '').localeCompare(String(right.name || ''))
            ))
    ), [metrics]);

    if (loading) return <div className={styles.state} aria-busy="true">Loading program overview…</div>;
    if (error) return <div className={styles.state} role="alert">Program overview could not be loaded. Try again shortly.</div>;
    if (!metrics) return <div className={styles.state}>Program overview is not available yet.</div>;

    const headlineMetrics = [
        [metrics.adherence.mode === 'density' ? 'Active-day density' : 'Adherence', formatPercent(metrics.adherence.rate)],
        ['Alignment', formatPercent(metrics.alignment.duration_seconds.rate)],
        ['Current streak', `${metrics.adherence.current_streak} ${metrics.adherence.current_streak === 1 ? 'day' : 'days'}`],
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

            <section className={styles.section} aria-labelledby="program-block-results-title">
                <div className={styles.sectionHeading}>
                    <h2 id="program-block-results-title">Blocks in scope</h2>
                </div>
                {blocksInScope.length ? (
                    <ol className={styles.blockList}>
                        {blocksInScope.map((block) => (
                            <li key={block.block_id} className={styles.blockRow}>
                                <div className={styles.blockName}>
                                    <span className={styles.blockMarker} style={block.color ? { background: block.color } : undefined} aria-hidden="true" />
                                    <span>{block.name}</span>
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
                        ))}
                    </ol>
                ) : <p className={styles.empty}>No blocks have started yet.</p>}
            </section>

            <section className={styles.section} aria-labelledby="program-goal-coverage-title">
                <div className={styles.sectionHeading}>
                    <h2 id="program-goal-coverage-title">Goal coverage</h2>
                    <span>Effort share</span>
                </div>
                {goalCoverage.length ? (
                    <ul className={styles.goalList}>
                        {goalCoverage.map((goal) => {
                            const goalDescriptor = {
                                level_id: goal.level_id,
                                level_name: goal.level_name || goal.level,
                                type: goal.type,
                                is_smart: goal.is_smart,
                            };
                            const styleSource = goalDescriptor.level_id || goalDescriptor.level_name
                                ? goalDescriptor
                                : goalDescriptor.type;
                            const effortPercent = Math.max(1, Math.min(100, Math.round(goal.effort_share * 100)));
                            return (
                                <li key={goal.goal_id} className={styles.goalRow}>
                                    <div className={styles.goalIdentity}>
                                        <GoalIcon
                                            shape={getGoalIcon(styleSource)}
                                            color={getGoalColor(styleSource)}
                                            secondaryColor={getGoalSecondaryColor(styleSource)}
                                            isSmart={Boolean(goal.is_smart)}
                                            size={16}
                                        />
                                        <span title={goal.name}>{goal.name}</span>
                                        <strong>{formatEffortShare(goal.effort_share)}</strong>
                                    </div>
                                    <div className={styles.effortTrack} aria-hidden="true">
                                        <span style={{ width: `${effortPercent}%` }} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : <p className={styles.empty}>No goals have effort in this timeframe.</p>}
            </section>
        </div>
    );
}

ProgramOverview.propTypes = {
    metrics: PropTypes.object,
    loading: PropTypes.bool,
    error: PropTypes.object,
};
