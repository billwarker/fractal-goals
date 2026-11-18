import React from 'react';

import { formatDateTime } from './usageParts';
import panelStyles from './UsageStoragePanel.module.css';
import styles from './UsageViews.module.css';

const STALE_MS = 48 * 60 * 60 * 1000;

const JOBS = [
    {
        key: 'export',
        label: 'BigQuery export (nightly)',
        consequence: 'events aren’t reaching BigQuery or being flushed, so they build up in Postgres',
    },
    {
        key: 'retention',
        label: 'Data retention (daily)',
        consequence: 'erasures and the published retention limits aren’t being enforced',
    },
];

const isStale = (job) => !job?.last_success_at || Date.now() - new Date(job.last_success_at).getTime() > STALE_MS;

/**
 * Both jobs run from Cloud Scheduler triggers created by hand, once. A missing or
 * failing trigger is otherwise silent, so each warns after 48 hours without a success.
 */
export default function ScheduledJobs({ jobs = {} }) {
    const stale = JOBS.filter((job) => isStale(jobs[job.key]));
    return (
        <>
            <h4 className={styles.subheading}>Scheduled jobs</h4>
            <table className={styles.compactTable}>
                <thead>
                    <tr>
                        <th>Job</th>
                        <th>Last success</th>
                        <th>Last run</th>
                    </tr>
                </thead>
                <tbody>
                    {JOBS.map((job) => (
                        <tr key={job.key}>
                            <td>{job.label}</td>
                            <td>{formatDateTime(jobs[job.key]?.last_success_at)}</td>
                            <td>{formatDateTime(jobs[job.key]?.last_run_at)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {stale.map((job) => (
                <p key={job.key} className={panelStyles.warning} role="status">
                    {job.label} hasn’t succeeded in the last 48 hours: {job.consequence}. Check its Cloud Scheduler trigger.
                </p>
            ))}
        </>
    );
}
