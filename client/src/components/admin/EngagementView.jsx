import React from 'react';

import DauBarChart from './DauBarChart';
import LiveSinceNote from './LiveSinceNote';
import { wapSeries } from './usageParts';
import styles from './UsageViews.module.css';

/** Overview → Engagement: the weekly KPI, daily activity, and which parts of the app get used. */
export default function EngagementView({ data }) {
    const { wap, feature_adoption: adoption } = data.growth;
    const topPages = data.top_pages || [];
    return (
        <div className={styles.view}>
            <div className={styles.viewGrid}>
                <div>
                    <h4 className={styles.subheading}>Weekly active practitioners</h4>
                    <DauBarChart
                        dau={wapSeries(wap)}
                        seriesLabel="Practitioners"
                        unit="practitioner"
                        xTitle="Week of"
                        height={160}
                        compact
                        ariaLabel={`Weekly active practitioners for the ${wap.weeks.length} weeks to ${wap.current.week_start}`}
                    />
                    <p className={styles.note}>Accounts completing at least one session in the week (Monday–Sunday, UTC).</p>
                </div>
                <div>
                    <h4 className={styles.subheading}>Daily active users</h4>
                    <DauBarChart
                        dau={data.active_users?.dau || []}
                        windowStart={data.window?.start}
                        windowEnd={data.window?.end}
                        height={160}
                        compact
                    />
                    <LiveSinceNote liveSince={data.live_since?.product_events} windowStart={data.window?.start} />
                </div>
            </div>
            <div className={styles.viewGrid}>
                <div>
                    <h4 className={styles.subheading}>Feature use this week</h4>
                    <table className={styles.compactTable}>
                        <thead>
                            <tr>
                                <th>Feature</th>
                                <th className={styles.num}>Practitioners</th>
                                <th className={styles.num}>Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adoption.features.map((row) => (
                                <tr key={row.feature}>
                                    <td>{row.feature}</td>
                                    <td className={styles.num}>{row.users}</td>
                                    <td className={styles.num}>{`${Math.round(row.share * 100)}%`}</td>
                                </tr>
                            ))}
                            {adoption.features.length === 0 && <tr><td colSpan={3}>No practitioners in the last {adoption.days} days.</td></tr>}
                        </tbody>
                    </table>
                    <p className={styles.note}>
                        Of the {adoption.practitioners} practitioners in the last {adoption.days} days, how many opened each part of the app.
                    </p>
                </div>
                <div>
                    <h4 className={styles.subheading}>Top pages</h4>
                    <div className={styles.tableScroll}>
                        <table className={styles.compactTable}>
                            <thead>
                                <tr>
                                    <th>Path</th>
                                    <th className={styles.num}>Views</th>
                                    <th className={styles.num}>Users</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topPages.map((page) => (
                                    <tr key={page.path}>
                                        <td>{page.path}</td>
                                        <td className={styles.num}>{page.count}</td>
                                        <td className={styles.num}>{page.users}</td>
                                    </tr>
                                ))}
                                {topPages.length === 0 && <tr><td colSpan={3}>No page views recorded yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
