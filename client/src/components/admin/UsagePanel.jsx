import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DateRangeFilter from '../common/DateRangeFilter';
import DauBarChart from './DauBarChart';
import EventsBreakdownTable from './EventsBreakdownTable';
import UsageStoragePanel from './UsageStoragePanel';
import { adminApi } from '../../utils/api';
import { presetToRange } from '../../utils/dateRange';
import styles from '../../pages/Admin.module.css';

const USAGE_PRESETS = ['7d', '30d', '90d', '6m', '1y', 'custom'];

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Never');

export default function UsagePanel({ enabled }) {
    const [dateRange, setDateRange] = useState(() => presetToRange('30d'));

    const usageQueryKey = ['admin', 'usage', dateRange.start, dateRange.end];
    const usageQuery = useQuery({
        queryKey: usageQueryKey,
        queryFn: async () => (await adminApi.getUsage({
            ...(dateRange.start ? { start: dateRange.start } : {}),
            ...(dateRange.end ? { end: dateRange.end } : {}),
        })).data,
        enabled,
    });

    const data = usageQuery.data;
    const dau = data?.active_users?.dau || [];
    const perUser = data?.per_user || [];
    const topPages = data?.top_pages || [];
    const topEvents = data?.top_events || [];
    const emailHealth = data?.email_health || [];

    return (
        <section className={styles.section}>
            <DateRangeFilter
                value={dateRange}
                onChange={setDateRange}
                presets={USAGE_PRESETS}
                classNames={{
                    chipGroup: styles.betaStatusFilters,
                    chipActive: styles.activeTab,
                }}
            />

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
                    <DauBarChart
                        dau={dau}
                        windowStart={data.window?.start}
                        windowEnd={data.window?.end}
                    />

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
                                <th>Total Events</th>
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
                                    <td>{entry.total_events}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <h3>Domain events</h3>
                    <EventsBreakdownTable events={data.events_breakdown || []} />

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

                    <UsageStoragePanel
                        storage={data.storage}
                        retention={data.retention}
                        exportState={data.export}
                    />
                </>
            )}
        </section>
    );
}
