import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../../utils/api';
import LoadingState from '../common/LoadingState';
import ScheduledJobs from './ScheduledJobs';
import UsageStoragePanel from './UsageStoragePanel';
import styles from './UsageViews.module.css';

/**
 * Overview → System: email delivery health, the scheduled jobs, and database storage.
 * Storage is its own request, made only here, since sizing event_logs scans the table.
 */
export default function UsageSystemView({ data }) {
    const emailHealth = data.email_health || [];
    const storageQuery = useQuery({
        queryKey: ['admin', 'usage', 'storage'],
        queryFn: async () => (await adminApi.getUsageStorage()).data,
    });
    const system = storageQuery.data;

    return (
        <div className={styles.view}>
            <p className={styles.note}>Storage and jobs show the system as it is now; the date range only affects email.</p>
            <h4 className={styles.subheading}>Email delivery</h4>
            <table className={styles.compactTable}>
                <thead>
                    <tr>
                        <th>Template</th>
                        <th>Status</th>
                        <th className={styles.num}>Count</th>
                    </tr>
                </thead>
                <tbody>
                    {emailHealth.map((row) => (
                        <tr key={`${row.template_key}-${row.status}`}>
                            <td>{row.template_key}</td>
                            <td>{row.status}</td>
                            <td className={styles.num}>{row.count}</td>
                        </tr>
                    ))}
                    {emailHealth.length === 0 && <tr><td colSpan={3}>No email activity in this window.</td></tr>}
                </tbody>
            </table>
            {storageQuery.isLoading && <LoadingState label="Loading storage…" />}
            {storageQuery.isError && <p>Failed to load storage.</p>}
            {system && (
                <>
                    <ScheduledJobs jobs={system.jobs} />
                    <UsageStoragePanel storage={system.storage} retention={system.retention} exportState={system.export} />
                </>
            )}
        </div>
    );
}
