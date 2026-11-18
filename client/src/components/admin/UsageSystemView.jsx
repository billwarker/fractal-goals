import React from 'react';

import UsageStoragePanel from './UsageStoragePanel';
import styles from './UsageViews.module.css';

/** Overview → System: email delivery health and database storage housekeeping. */
export default function UsageSystemView({ data }) {
    const emailHealth = data.email_health || [];
    return (
        <div className={styles.view}>
            <p className={styles.note}>Storage shows the database as it is now; the date range only affects email.</p>
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
            <UsageStoragePanel storage={data.storage} retention={data.retention} exportState={data.export} />
        </div>
    );
}
