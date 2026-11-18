import React from 'react';

import styles from './UsageViews.module.css';

export const percent = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

export const weekChange = (current, previous) => {
    if (!previous) return current ? 'new this week' : 'none last week';
    const delta = current - previous;
    if (delta === 0) return 'same as last week';
    return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week`;
};

export const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Never');

export function KpiStrip({ items, label }) {
    return (
        <div className={styles.kpiStrip} role="list" aria-label={label}>
            {items.map((item) => (
                <div key={item.label} className={styles.kpiCard} role="listitem">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    {item.detail && <small>{item.detail}</small>}
                </div>
            ))}
        </div>
    );
}

/** A section title with an optional link to the tab holding the full detail. */
export function SectionHeader({ title, onOpen, openLabel }) {
    return (
        <div className={styles.sectionHeader}>
            <h4 className={styles.subheading}>{title}</h4>
            {onOpen && (
                <button type="button" className={styles.linkButton} onClick={onOpen}>
                    {openLabel} →
                </button>
            )}
        </div>
    );
}

export function NamedCounts({ title, rows, empty }) {
    return (
        <div>
            <h4 className={styles.subheading}>{title}</h4>
            <table className={styles.compactTable}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th className={styles.num}>Visitors</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.name}>
                            <td>{row.name}</td>
                            <td className={styles.num}>{row.visitors}</td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={2}>{empty}</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

const STAGE_LABELS = {
    public: 'Before sign-up · each step counted on its own',
    cohort: 'After sign-up · following the window’s sign-ups',
};

/**
 * Visitor → activated steps in two stages. Steps before sign-up are independent counts and
 * the later steps follow one cohort, so a rate is shown only within a stage.
 */
export function FunnelTable({ funnel }) {
    const visitors = funnel[0]?.count || 0;
    const stages = Object.keys(STAGE_LABELS).filter((stage) => funnel.some((step) => step.stage === stage));
    return (
        <table className={styles.compactTable}>
            <thead>
                <tr>
                    <th>Step</th>
                    <th>Count</th>
                    <th className={styles.num}>From previous</th>
                    <th className={styles.num}>From visitors</th>
                </tr>
            </thead>
            {stages.map((stage) => {
                const steps = funnel.filter((step) => step.stage === stage);
                const max = Math.max(1, ...steps.map((step) => step.count));
                return (
                    <tbody key={stage}>
                        <tr className={styles.stageRow}>
                            <th scope="rowgroup" colSpan={4}>{STAGE_LABELS[stage]}</th>
                        </tr>
                        {steps.map((step, index) => (
                            <tr key={step.key}>
                                <td>{step.label}</td>
                                <td>
                                    <div className={styles.funnelCount}>
                                        <span>{step.count}</span>
                                        <progress className={styles.bar} value={step.count} max={max} aria-hidden="true" />
                                    </div>
                                </td>
                                <td className={styles.num}>{index === 0 ? '' : percent(step.count, steps[index - 1].count)}</td>
                                <td className={styles.num}>{stage === 'public' && step.key !== 'visitors' ? percent(step.count, visitors) : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                );
            })}
        </table>
    );
}

/** The weekly KPI series as `{ date, count }` rows for DauBarChart. */
export const wapSeries = (wap) => wap.weeks.map((week) => ({ date: week.week_start, count: week.count }));
