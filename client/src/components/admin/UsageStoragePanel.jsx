import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import styles from '../../pages/Admin.module.css';
import panelStyles from './UsageStoragePanel.module.css';
import viewStyles from './UsageViews.module.css';

const QUOTA_WARNING_SHARE = 0.8;

const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return 'n/a';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

const formatCounts = (counts) => Object.entries(counts || {}).map(([table, count]) => `${table} ${count}`).join(', ');

function QuotaGauge({ totalBytes, quotaBytes }) {
    if (!quotaBytes || totalBytes === null || totalBytes === undefined) return null;
    const share = totalBytes / quotaBytes;
    return (
        <div className={panelStyles.quota}>
            <p>
                <strong>{formatBytes(totalBytes)}</strong> of {formatBytes(quotaBytes)} database quota
                {' '}({Math.round(share * 100)}%)
            </p>
            <progress className={panelStyles.bar} value={Math.min(totalBytes, quotaBytes)} max={quotaBytes} aria-hidden="true" />
            {share >= QUOTA_WARNING_SHARE && (
                <p className={panelStyles.warning} role="status">
                    The database is near its storage quota. Check the largest relations below.
                </p>
            )}
            <p className={viewStyles.note}>
                Postgres reuses the space deleted rows leave rather than returning it, so the total levels off after a flush instead of dropping.
            </p>
        </div>
    );
}

/**
 * Storage management: the database quota, the largest tables, the live window that
 * exported analytics keep in Postgres, the flush action, and the BigQuery export state.
 */
function UsageStoragePanel({ storage, retention, exportState }) {
    const queryClient = useQueryClient();
    const [retentionDaysDraft, setRetentionDaysDraft] = useState(null);
    const liveDays = retentionDaysDraft ?? retention?.live_days ?? 35;

    const retentionMutation = useMutation({
        mutationFn: (days) => adminApi.updateUsageRetention({ live_days: days }),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'usage'] });
            notify.success(`Postgres now keeps ${response.data.live_days} days of exported events`);
        },
        onError: (error) => notify.error(`Failed to update the live window: ${formatError(error)}`),
    });

    const pruneMutation = useMutation({
        mutationFn: () => adminApi.pruneUsage({}),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'usage'] });
            notify.success(`Flushed ${response.data.deleted} exported events older than ${response.data.live_days} days`);
        },
        onError: (error) => notify.error(`Failed to flush exported events: ${formatError(error)}`),
    });

    const handlePrune = () => {
        const confirmed = window.confirm(
            `Delete product and website events older than ${retention?.live_days ?? 35} days from Postgres? Only events already in BigQuery are deleted; the rest stay until they are exported.`,
        );
        if (confirmed) {
            pruneMutation.mutate();
        }
    };

    const tables = storage?.tables || [];
    const databaseStorage = storage?.database || {};
    const databaseRelations = databaseStorage.relations || [];
    const exportTables = exportState?.tables || {};
    const payloads = storage?.event_log_payloads || [];
    const lastFlushed = formatCounts(exportState?.last_run_flushed);

    return (
        <>
            <h4 className={viewStyles.subheading}>Database storage</h4>
            <QuotaGauge totalBytes={databaseStorage.total_bytes} quotaBytes={databaseStorage.quota_bytes} />
            <details>
                <summary>Largest relations</summary>
                <p className={viewStyles.note}>
                    Total database storage: {formatBytes(databaseStorage.total_bytes)}.
                    {' '}Non-system relations: {formatBytes(databaseStorage.relation_bytes)}.
                    {' '}System catalogs, internal objects, and free space: {formatBytes(databaseStorage.other_bytes)}.
                </p>
                <table className={viewStyles.compactTable}>
                    <thead>
                        <tr>
                            <th>Relation</th>
                            <th>Est. rows</th>
                            <th>Total</th>
                            <th>Table</th>
                            <th>Indexes</th>
                            <th>TOAST</th>
                        </tr>
                    </thead>
                    <tbody>
                        {databaseRelations.slice(0, 25).map((relation) => (
                            <tr key={`${relation.schema}.${relation.table}`}>
                                <td>{relation.schema}.{relation.table}</td>
                                <td>{relation.estimated_rows}</td>
                                <td>{formatBytes(relation.total_bytes)}</td>
                                <td>{formatBytes(relation.table_bytes)}</td>
                                <td>{formatBytes(relation.index_bytes)}</td>
                                <td>{formatBytes(relation.toast_bytes)}</td>
                            </tr>
                        ))}
                        {!databaseRelations.length && (
                            <tr>
                                <td colSpan="6">Database storage breakdown unavailable for this environment.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </details>

            <h4 className={viewStyles.subheading}>Event storage</h4>
            <table className={viewStyles.compactTable}>
                <thead>
                    <tr>
                        <th>Table</th>
                        <th>Rows</th>
                        <th>Size</th>
                        <th>Oldest</th>
                        <th>Newest</th>
                        <th>Exported through</th>
                    </tr>
                </thead>
                <tbody>
                    {tables.map((table) => (
                        <tr key={table.table}>
                            <td>{table.table}</td>
                            <td>{table.rows}</td>
                            <td>{formatBytes(table.bytes)}</td>
                            <td>{formatDateTime(table.oldest)}</td>
                            <td>{formatDateTime(table.newest)}</td>
                            <td>{formatDateTime(exportTables[table.table]?.last_ts)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p className={viewStyles.note}>
                Each nightly export flushes product and website events older than the live window once they are in
                BigQuery. Whatever happens to the export, nothing is kept past {retention?.product_events_ceiling_days ?? 180} days
                (product) or {retention?.web_events_ceiling_days ?? 90} days (website).
            </p>
            <div className={styles.userCreator}>
                <label htmlFor="analytics-live-days">Keep in Postgres after export (days)</label>
                <input
                    id="analytics-live-days"
                    type="number"
                    min="30"
                    max="180"
                    value={liveDays}
                    onChange={(event) => setRetentionDaysDraft(event.target.value)}
                />
                <button
                    type="button"
                    onClick={() => retentionMutation.mutate(Number(liveDays))}
                    disabled={retentionMutation.isPending}
                >
                    Save Live Window
                </button>
                <button
                    type="button"
                    onClick={handlePrune}
                    disabled={pruneMutation.isPending}
                >
                    {pruneMutation.isPending ? 'Flushing...' : 'Flush Exported Events'}
                </button>
            </div>

            <p>
                Last BigQuery export:{' '}
                {exportState?.last_run_at
                    ? `${formatDateTime(exportState.last_run_at)} (${exportState.last_run_status || 'unknown'})`
                    : 'Never exported'}
                {lastFlushed && ` · flushed ${lastFlushed}`}
            </p>

            <h4 className={viewStyles.subheading}>Activity history by event type</h4>
            <p className={viewStyles.note}>
                Fractal activity history is kept for the life of the account (it drives goal timelines), so it is
                measured here rather than flushed.
            </p>
            <table className={viewStyles.compactTable}>
                <thead>
                    <tr>
                        <th>Event type</th>
                        <th>Events</th>
                        <th>Payloads</th>
                        <th>Descriptions</th>
                    </tr>
                </thead>
                <tbody>
                    {payloads.map((row) => (
                        <tr key={row.event_type}>
                            <td>{row.event_type}</td>
                            <td>{row.events}</td>
                            <td>{formatBytes(row.payload_bytes)}</td>
                            <td>{formatBytes(row.description_bytes)}</td>
                        </tr>
                    ))}
                    {!payloads.length && (
                        <tr>
                            <td colSpan="4">No activity history sizes for this environment.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </>
    );
}

export default UsageStoragePanel;
