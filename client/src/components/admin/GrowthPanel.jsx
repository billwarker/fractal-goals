import React from 'react';

import DauBarChart from './DauBarChart';
import adminStyles from '../../pages/Admin.module.css';
import styles from './GrowthPanel.module.css';

const percent = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

const change = (current, previous) => {
    if (!previous) return current ? 'new this week' : 'none last week';
    const delta = current - previous;
    if (delta === 0) return 'same as last week';
    return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week`;
};

function NamedCounts({ title, rows, empty }) {
    return (
        <div>
            <h4 className={styles.subheading}>{title}</h4>
            <table className={adminStyles.table}>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.visitors}</td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={2}>{empty}</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Admin → Usage: traffic to the public site, how visitors convert into practising
 * accounts, and the KPI, Weekly Active Practitioners (services/growth_metrics_service.py).
 */
export default function GrowthPanel({ growth, windowStart, windowEnd }) {
    if (!growth) return null;
    const { traffic, funnel, wap, feature_adoption: adoption } = growth;
    const first = funnel[0]?.count || 0;
    const signedUp = funnel.find((step) => step.key === 'signed_up')?.count || 0;

    return (
        <section className={styles.panel} aria-labelledby="growth-heading">
            <h3 id="growth-heading">Acquisition &amp; engagement</h3>
            <div className={adminStyles.summaryGrid}>
                <div className={adminStyles.summaryCard}>
                    <span>Weekly active practitioners</span>
                    <div className={styles.kpi}>
                        <strong>{wap.current.count}</strong>
                        <small>{change(wap.current.count, wap.previous.count)}</small>
                    </div>
                </div>
                <div className={adminStyles.summaryCard}>
                    <span>Practising this week</span>
                    <div className={styles.kpi}>
                        <strong>{percent(wap.current.count, wap.current.accounts)}</strong>
                        <small>of {wap.current.accounts} accounts</small>
                    </div>
                </div>
                <div className={adminStyles.summaryCard}>
                    <span>Visitors in window</span>
                    <div className={styles.kpi}>
                        <strong>{traffic.visitor_days}</strong>
                        <small>{traffic.demo_starts} demo starts</small>
                    </div>
                </div>
                <div className={adminStyles.summaryCard}>
                    <span>Visitor → sign-up</span>
                    <div className={styles.kpi}>
                        <strong>{percent(signedUp, first)}</strong>
                        <small>{signedUp} signed up</small>
                    </div>
                </div>
            </div>

            <h4 className={styles.subheading}>Weekly active practitioners</h4>
            <p className={styles.note}>Accounts completing at least one session in the week (Monday–Sunday, UTC).</p>
            <DauBarChart
                dau={wap.weeks.map((week) => ({ date: week.week_start, count: week.count }))}
                seriesLabel="Practitioners"
                unit="practitioner"
                xTitle="Week of"
                ariaLabel={`Weekly active practitioners for the ${wap.weeks.length} weeks to ${wap.current.week_start}`}
            />

            <h4 className={styles.subheading}>Conversion</h4>
            <table className={`${adminStyles.table} ${styles.funnel}`}>
                <thead>
                    <tr>
                        <th>Step</th>
                        <th>Count</th>
                        <th>From previous</th>
                        <th>From visitors</th>
                    </tr>
                </thead>
                <tbody>
                    {funnel.map((step, index) => (
                        <tr key={step.key}>
                            <td>{step.label}</td>
                            <td>
                                <span className={styles.count}>{step.count}</span>
                                <progress className={styles.bar} value={step.count} max={Math.max(first, step.count, 1)} aria-hidden="true" />
                            </td>
                            <td>{index === 0 ? '' : percent(step.count, funnel[index - 1].count)}</td>
                            <td>{index === 0 ? '' : percent(step.count, first)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className={styles.note}>
                Visitors are counted per day: someone visiting on two days counts twice. Each step counts what
                happened in the window, so people part-way through appear in the earlier steps only.
            </p>

            <h4 className={styles.subheading}>Visitors per day</h4>
            <DauBarChart
                dau={traffic.visitors_by_day}
                seriesLabel="Visitors"
                unit="visitor"
                ariaLabel={`Public site visitors per day from ${windowStart} to ${windowEnd}`}
            />
            <div className={styles.columns}>
                <NamedCounts title="Top referring sites" rows={traffic.top_referrers} empty="No referred visits yet." />
                <NamedCounts title="Top campaigns (utm_source)" rows={traffic.top_campaigns} empty="No campaign visits yet." />
            </div>

            <h4 className={styles.subheading}>Feature use this week</h4>
            <p className={styles.note}>
                Of the {adoption.practitioners} practitioners in the last {adoption.days} days, how many opened each part of the app.
            </p>
            <table className={adminStyles.table}>
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Practitioners</th>
                        <th>Share</th>
                    </tr>
                </thead>
                <tbody>
                    {adoption.features.map((row) => (
                        <tr key={row.feature}>
                            <td>{row.feature}</td>
                            <td>{row.users}</td>
                            <td>{`${Math.round(row.share * 100)}%`}</td>
                        </tr>
                    ))}
                    {adoption.features.length === 0 && <tr><td colSpan={3}>No practitioners in the last {adoption.days} days.</td></tr>}
                </tbody>
            </table>
        </section>
    );
}
