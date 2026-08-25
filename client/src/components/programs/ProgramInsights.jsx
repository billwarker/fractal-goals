import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import ProgramName from '../atoms/ProgramName';
import Tooltip from '../atoms/Tooltip';
import styles from './ProgramInsights.module.css';

const percent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;
const duration = (seconds) => `${Math.round((seconds || 0) / 360) / 10}h`;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EFFORT_SHARE_EXPLANATION = 'Each evidence instance\u2019s duration is split equally across its eligible goals. A goal\u2019s share is its allocated duration divided by all aligned duration. Credited instance counts can overlap, and zero-duration evidence does not affect the share.';
const ADHERENCE_STATES = [
    ['scheduled_met', 'Met'],
    ['scheduled_missed', 'Missed'],
    ['unscheduled_evidence', 'Unscheduled evidence'],
    ['rest', 'Rest'],
    ['upcoming', 'Upcoming'],
];

const compareValues = (left, right, direction) => {
    const leftValues = Array.isArray(left) ? left : [left];
    const rightValues = Array.isArray(right) ? right : [right];
    const length = Math.max(leftValues.length, rightValues.length);

    for (let index = 0; index < length; index += 1) {
        const leftValue = leftValues[index];
        const rightValue = rightValues[index];
        const leftMissing = leftValue == null || leftValue === '';
        const rightMissing = rightValue == null || rightValue === '';
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        if (leftMissing) continue;

        const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
            ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
            : Number(leftValue) - Number(rightValue);
        if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
    }
    return 0;
};

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
                <ul className={styles.legend} aria-label="Adherence cell legend">
                    {ADHERENCE_STATES.map(([state, label]) => (
                        <li key={state}><span className={`${styles.legendSwatch} ${styles[state]}`} aria-hidden="true" />{label}</li>
                    ))}
                </ul>
                <details><summary>Daily data table</summary><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>State</th><th>Instances</th><th>Duration</th></tr></thead><tbody>{metrics.days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.state.replaceAll('_', ' ')}</td><td>{day.instances}</td><td>{duration(day.duration_seconds)}</td></tr>)}</tbody></table></div></details>
            </section>

            <div className={styles.grid}>
                <MetricTable
                    title="Blocks"
                    rows={metrics.blocks}
                    rowKey={(row) => row.block_id}
                    initialSort={{ key: 'block', direction: 'asc' }}
                    columns={[
                        { key: 'block', label: 'Block', sortable: true, sortValue: (row) => [row.start_date, row.end_date, row.name, row.block_id], cell: (row) => row.name },
                        { key: 'adherence', label: 'Met / scheduled', sortable: true, sortValue: (row) => [row.adherence.scheduled_days_observed ? row.adherence.met_days / row.adherence.scheduled_days_observed : null, row.adherence.met_days, row.adherence.scheduled_days_observed], cell: (row) => `${row.adherence.met_days} / ${row.adherence.scheduled_days_observed}` },
                        { key: 'alignment', label: 'Alignment', sortable: true, sortValue: (row) => row.alignment.duration_seconds.rate, cell: (row) => percent(row.alignment.duration_seconds.rate) },
                        { key: 'sessions', label: 'Linked sessions', sortable: true, sortValue: (row) => row.linked_sessions, cell: (row) => row.linked_sessions },
                    ]}
                />
                <MetricTable
                    title="Goal coverage"
                    rows={metrics.goal_coverage}
                    rowKey={(row) => row.goal_id}
                    columns={[
                        {
                            key: 'goal', label: 'Goal', sortable: true, sortValue: (row) => row.name, cell: (row) => {
                                const goal = { level_id: row.level_id, level_name: row.level_name || row.level, type: row.type, is_smart: row.is_smart };
                                const goalStyleSource = goal.level_id || goal.level_name ? goal : goal.type;
                                return <span className={styles.goalCell}>
                                    <span className={styles.goalIcon} aria-hidden="true"><GoalIcon shape={getGoalIcon(goalStyleSource)} color={getGoalColor(goalStyleSource)} secondaryColor={getGoalSecondaryColor(goalStyleSource)} isSmart={Boolean(row.is_smart)} size={18} /></span>
                                    <span>{row.name}</span>
                                </span>;
                            },
                        },
                        { key: 'effort', label: 'Effort share', sortable: true, sortValue: (row) => row.effort_share, cell: (row) => percent(row.effort_share), tooltip: EFFORT_SHARE_EXPLANATION },
                        { key: 'instances', label: 'Instances', sortable: true, sortValue: (row) => row.credited_instances, cell: (row) => row.credited_instances },
                        { key: 'lastEvidence', label: 'Last evidence', sortable: true, sortValue: (row) => row.last_evidence_at, cell: (row) => row.last_evidence_at?.slice(0, 10) || '—' },
                    ]}
                />
                <MetricTable title="Template execution" headings={['Template', 'Completed / scheduled', 'Rate', 'Extra']} rows={metrics.templates.map((row) => [row.name, `${row.completed_occurrences} / ${row.scheduled_occurrences}`, percent(row.completion_rate), row.extra_completions])} />
                <MetricTable title="Weekday patterns" headings={['Day', 'Met / scheduled', 'Instances', 'Duration']} rows={metrics.weekday.map((row) => [WEEKDAYS[row.weekday], `${row.met_days} / ${row.scheduled_days_observed}`, row.instances, duration(row.duration_seconds)])} />
                <MetricTable title="Volume" headings={['Period', 'Sessions', 'Instances', 'Duration']} rows={metrics.volume.map((row) => [row.period_start, row.sessions, row.instances, duration(row.duration_seconds)])} />
                <MetricTable title="Outcomes" headings={['Measure', 'Value']} rows={[["Goals completed", `${metrics.outcomes.goals_completed_in_window} / ${metrics.outcomes.goals_in_scope}`], ["Targets met", metrics.outcomes.targets_met_in_window.length], ["Targets open", metrics.outcomes.targets_open]]} />
            </div>
            <section className={styles.card}><h3>Past program comparison</h3>{metrics.program.status !== 'ended' ? <p className={styles.semantics}>Comparison becomes available when this program ends.</p> : comparison ? <MetricTable title="Comparison results" headings={['Program', 'Adherence', 'Alignment', 'Met days']} rows={comparison.programs.map((row) => [<ProgramName name={row.name} color={row.color} />, percent(row.adherence_rate), percent(row.alignment_rate), row.met_days])} /> : <Button variant="secondary" onClick={onLoadComparison} isLoading={comparisonLoading}>Compare up to five ended programs</Button>}</section>
            <p className={styles.semantics}>Current-state attribution · Equal-split effort allocation · Explicit program session linkage · Calculation v{metrics.calculation_version}</p>
        </section>
    );
}

function MetricTable({ title, headings, columns, rows, rowKey, initialSort }) {
    const [sort, setSort] = useState(initialSort || null);
    const resolvedColumns = columns || headings.map((heading, index) => ({ key: String(index), label: heading, cell: (row) => row[index] }));
    const sortedRows = useMemo(() => {
        const activeColumn = sort && resolvedColumns.find((column) => column.key === sort.key);
        if (!activeColumn?.sortValue) return rows;
        return rows.map((row, index) => ({ row, index })).sort((left, right) => (
            compareValues(activeColumn.sortValue(left.row), activeColumn.sortValue(right.row), sort.direction)
            || left.index - right.index
        )).map(({ row }) => row);
    }, [resolvedColumns, rows, sort]);

    const updateSort = (column) => {
        setSort((current) => ({
            key: column.key,
            direction: current?.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    return <section className={styles.card}><h3>{title}</h3><div className={styles.tableWrap}><table><thead><tr>{resolvedColumns.map((column) => {
        const activeDirection = sort?.key === column.key ? sort.direction : null;
        return <th key={column.key} aria-sort={column.sortable ? (activeDirection === 'asc' ? 'ascending' : activeDirection === 'desc' ? 'descending' : 'none') : undefined}>
            <span className={styles.headingContent}>
                {column.sortable ? <button type="button" className={styles.sortButton} onClick={() => updateSort(column)}>{column.label}<span aria-hidden="true" className={styles.sortIndicator}>{activeDirection === 'asc' ? '▲' : activeDirection === 'desc' ? '▼' : '↕'}</span></button> : column.label}
                {column.tooltip ? <Tooltip label={column.tooltip} portal><button type="button" className={styles.helpButton} aria-label={`How ${column.label.toLowerCase()} is calculated`}><span aria-hidden="true">i</span></button></Tooltip> : null}
            </span>
        </th>;
    })}</tr></thead><tbody>{sortedRows.length ? sortedRows.map((row, index) => <tr key={rowKey?.(row) ?? index}>{resolvedColumns.map((column) => <td key={column.key}>{column.cell(row)}</td>)}</tr>) : <tr><td colSpan={resolvedColumns.length}>No data in this range</td></tr>}</tbody></table></div></section>;
}

ProgramMetricsStrip.propTypes = { metrics: PropTypes.object, loading: PropTypes.bool };
ProgramInsights.propTypes = { metrics: PropTypes.object, loading: PropTypes.bool, error: PropTypes.object, onRangeChange: PropTypes.func.isRequired, comparison: PropTypes.object, comparisonLoading: PropTypes.bool, onLoadComparison: PropTypes.func.isRequired };
MetricTable.propTypes = { title: PropTypes.string.isRequired, headings: PropTypes.arrayOf(PropTypes.string), columns: PropTypes.arrayOf(PropTypes.object), rows: PropTypes.array.isRequired, rowKey: PropTypes.func, initialSort: PropTypes.shape({ key: PropTypes.string.isRequired, direction: PropTypes.oneOf(['asc', 'desc']).isRequired }) };
