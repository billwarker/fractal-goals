import React from 'react';
import PropTypes from 'prop-types';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import styles from './ProgramInsights.module.css';

const percent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;
const duration = (seconds) => `${Math.round((seconds || 0) / 360) / 10}h`;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ProgramMetricsStrip({ metrics, loading }) {
    if (loading) return <div className={styles.strip} aria-busy="true">Loading program metrics…</div>;
    if (!metrics) return null;
    const items = [
        [metrics.adherence.mode === 'density' ? 'Active-day density' : 'Adherence', percent(metrics.adherence.rate)],
        ['Alignment', percent(metrics.alignment.duration_seconds.rate)],
        ['Current streak', `${metrics.adherence.current_streak} days`],
        ['Program progress', percent(metrics.program.progress.rate)],
    ];
    return (
        <dl className={styles.strip} aria-label={`Program metrics for ${metrics.window.scope_label}`}>
            {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
    );
}

export default function ProgramInsights({ metrics, loading, error, onRangeChange, comparison, comparisonLoading, onLoadComparison }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    if (loading) return <div className={styles.state} aria-busy="true">Loading insights…</div>;
    if (error) return <div className={styles.state} role="alert">Insights could not be loaded. Try again shortly.</div>;
    if (!metrics) return <div className={styles.state}>Select a program to view insights.</div>;
    const windowData = metrics.window;
    return (
        <section className={styles.insights} aria-labelledby="program-insights-title">
            <header className={styles.header}>
                <div><h2 id="program-insights-title">Insights</h2><p>{windowData.scope_label} · through {windowData.as_of}</p></div>
                <nav className={styles.rangeNav} aria-label="Metrics date range">
                    <Button variant="secondary" size="sm" disabled={!windowData.previous_range} onClick={() => onRangeChange(windowData.previous_range)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={!windowData.next_range} onClick={() => onRangeChange(windowData.next_range)}>Next</Button>
                </nav>
            </header>
            {metrics.data_sufficiency.message && <p className={styles.notice}>{metrics.data_sufficiency.message}</p>}
            <ProgramMetricsStrip metrics={metrics} />

            <section className={styles.card} aria-labelledby="adherence-title">
                <h3 id="adherence-title">Adherence by day</h3>
                <div className={styles.heatmap} role="list" aria-label="Daily adherence states">
                    {metrics.days.map((day) => <span key={day.date} role="listitem" className={styles[day.state]} title={`${day.date}: ${day.state.replaceAll('_', ' ')}`} aria-label={`${day.date}: ${day.state.replaceAll('_', ' ')}`} />)}
                </div>
                <div className={styles.legend}>Met · Missed · Unscheduled evidence · Rest · Upcoming</div>
                <details><summary>Daily data table</summary><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>State</th><th>Instances</th><th>Duration</th></tr></thead><tbody>{metrics.days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.state.replaceAll('_', ' ')}</td><td>{day.instances}</td><td>{duration(day.duration_seconds)}</td></tr>)}</tbody></table></div></details>
            </section>

            <div className={styles.grid}>
                <MetricTable title="Blocks" headings={['Block', 'Met / scheduled', 'Alignment', 'Linked sessions']} rows={metrics.blocks.map((row) => [row.name, `${row.adherence.met_days} / ${row.adherence.scheduled_days_observed}`, percent(row.alignment.duration_seconds.rate), row.linked_sessions])} />
                <MetricTable
                    title="Goal coverage"
                    headings={['Goal', 'Effort share', 'Instances', 'Last evidence']}
                    rowKeys={metrics.goal_coverage.map((row) => row.goal_id)}
                    rows={metrics.goal_coverage.map((row) => {
                        const goal = {
                            level_id: row.level_id,
                            level_name: row.level_name || row.level,
                            type: row.type,
                            is_smart: row.is_smart,
                        };
                        const goalStyleSource = goal.level_id || goal.level_name ? goal : goal.type;
                        return [
                            <span className={styles.goalCell} key={row.goal_id}>
                                <span className={styles.goalIcon} aria-hidden="true">
                                    <GoalIcon
                                        shape={getGoalIcon(goalStyleSource)}
                                        color={getGoalColor(goalStyleSource)}
                                        secondaryColor={getGoalSecondaryColor(goalStyleSource)}
                                        isSmart={Boolean(row.is_smart)}
                                        size={18}
                                    />
                                </span>
                                <span>{row.name}</span>
                            </span>,
                            percent(row.effort_share),
                            row.credited_instances,
                            row.last_evidence_at?.slice(0, 10) || '—',
                        ];
                    })}
                />
                <MetricTable title="Template execution" headings={['Template', 'Completed / scheduled', 'Rate', 'Extra']} rows={metrics.templates.map((row) => [row.name, `${row.completed_occurrences} / ${row.scheduled_occurrences}`, percent(row.completion_rate), row.extra_completions])} />
                <MetricTable title="Weekday patterns" headings={['Day', 'Met / scheduled', 'Instances', 'Duration']} rows={metrics.weekday.map((row) => [WEEKDAYS[row.weekday], `${row.met_days} / ${row.scheduled_days_observed}`, row.instances, duration(row.duration_seconds)])} />
                <MetricTable title="Volume" headings={['Period', 'Sessions', 'Instances', 'Duration']} rows={metrics.volume.map((row) => [row.period_start, row.sessions, row.instances, duration(row.duration_seconds)])} />
                <MetricTable title="Outcomes" headings={['Measure', 'Value']} rows={[["Goals completed", `${metrics.outcomes.goals_completed_in_window} / ${metrics.outcomes.goals_in_scope}`], ["Targets met", metrics.outcomes.targets_met_in_window.length], ["Targets open", metrics.outcomes.targets_open]]} />
            </div>
            <section className={styles.card}><h3>Past program comparison</h3>{metrics.program.status !== 'ended' ? <p className={styles.semantics}>Comparison becomes available when this program ends.</p> : comparison ? <MetricTable title="Comparison results" headings={['Program', 'Adherence', 'Alignment', 'Met days']} rows={comparison.programs.map((row) => [row.name, percent(row.adherence_rate), percent(row.alignment_rate), row.met_days])} /> : <Button variant="secondary" onClick={onLoadComparison} isLoading={comparisonLoading}>Compare up to five ended programs</Button>}</section>
            <p className={styles.semantics}>Current-state attribution · Equal-split effort allocation · Explicit program session linkage · Calculation v{metrics.calculation_version}</p>
        </section>
    );
}

function MetricTable({ title, headings, rows, rowKeys }) {
    return <section className={styles.card}><h3>{title}</h3><div className={styles.tableWrap}><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={rowKeys?.[index] ?? `${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length}>No data in this range</td></tr>}</tbody></table></div></section>;
}

ProgramMetricsStrip.propTypes = { metrics: PropTypes.object, loading: PropTypes.bool };
ProgramInsights.propTypes = { metrics: PropTypes.object, loading: PropTypes.bool, error: PropTypes.object, onRangeChange: PropTypes.func.isRequired, comparison: PropTypes.object, comparisonLoading: PropTypes.bool, onLoadComparison: PropTypes.func.isRequired };
MetricTable.propTypes = { title: PropTypes.string.isRequired, headings: PropTypes.arrayOf(PropTypes.string).isRequired, rows: PropTypes.arrayOf(PropTypes.array).isRequired, rowKeys: PropTypes.arrayOf(PropTypes.string) };
