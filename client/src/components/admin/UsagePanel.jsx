import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../../utils/api';
import styles from '../../pages/Admin.module.css';

const WINDOW_OPTIONS = [7, 30, 90];

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Never');

export default function UsagePanel({ enabled }) {
    const [days, setDays] = useState(30);

    const usageQuery = useQuery({
        queryKey: ['admin', 'usage', days],
        queryFn: async () => (await adminApi.getUsage({ days })).data,
        enabled,
    });

    const data = usageQuery.data;
    const dau = data?.active_users?.dau || [];
    const maxDau = Math.max(1, ...dau.map((day) => day.count));
    const perUser = data?.per_user || [];
    const topPages = data?.top_pages || [];
    const topEvents = data?.top_events || [];
    const emailHealth = data?.email_health || [];

    return (
        <section className={styles.section}>
            <div className={styles.betaStatusFilters}>
                {WINDOW_OPTIONS.map((option) => (
                    <button
                        key={option}
                        className={days === option ? styles.activeTab : ''}
                        onClick={() => setDays(option)}
                    >
                        {option} days
                    </button>
                ))}
            </div>

            {usageQuery.isLoading && <p>Loading usage data...</p>}
            {usageQuery.isError && <p>Failed to load usage data.</p>}

            {data && (
                <>
                    <div className={styles.summaryGrid}>
                        <div className={styles.summaryCard}>
                            <span>Active last 7 days</span>
                            <strong>{data.active_users?.wau ?? 0}</strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span>Active last 30 days</span>
                            <strong>{data.active_users?.mau ?? 0}</strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span>Signups in window</span>
                            <strong>{(data.signups_by_day || []).reduce((total, day) => total + day.count, 0)}</strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span>Page views in window</span>
                            <strong>{topEvents.find((event) => event.event_name === 'page_view')?.count ?? 0}</strong>
                        </div>
                    </div>

                    <h3>Daily active users</h3>
                    <div
                        role="img"
                        aria-label={`Daily active users over the last ${days} days`}
                        className={styles.dauStrip}
                    >
                        {dau.map((day) => (
                            <div
                                key={day.date}
                                title={`${day.date}: ${day.count} active`}
                                style={{
                                    height: `${Math.max(4, Math.round((day.count / maxDau) * 100))}%`,
                                    background: day.count > 0 ? 'var(--color-brand-primary, #4a90d9)' : 'var(--color-grid, #333)',
                                }}
                            />
                        ))}
                    </div>

                    <h3>Users</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Last Seen</th>
                                <th>Last Login</th>
                                <th>Page Views</th>
                                <th>Sessions Created</th>
                                <th>Goals Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {perUser.map((entry) => (
                                <tr key={entry.user_id}>
                                    <td>{entry.username} ({entry.email})</td>
                                    <td>{formatDateTime(entry.last_seen)}</td>
                                    <td>{formatDateTime(entry.last_login_at)}</td>
                                    <td>{entry.page_views}</td>
                                    <td>{entry.sessions_created}</td>
                                    <td>{entry.goals_created}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <h3>Top pages</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Path</th>
                                <th>Views</th>
                                <th>Users</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topPages.map((page) => (
                                <tr key={page.path}>
                                    <td>{page.path}</td>
                                    <td>{page.count}</td>
                                    <td>{page.users}</td>
                                </tr>
                            ))}
                            {topPages.length === 0 && (
                                <tr><td colSpan={3}>No page views recorded yet.</td></tr>
                            )}
                        </tbody>
                    </table>

                    <h3>Email delivery</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Template</th>
                                <th>Status</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {emailHealth.map((row) => (
                                <tr key={`${row.template_key}-${row.status}`}>
                                    <td>{row.template_key}</td>
                                    <td>{row.status}</td>
                                    <td>{row.count}</td>
                                </tr>
                            ))}
                            {emailHealth.length === 0 && (
                                <tr><td colSpan={3}>No email activity in this window.</td></tr>
                            )}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}
