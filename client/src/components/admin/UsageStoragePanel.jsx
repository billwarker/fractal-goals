import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import styles from '../../pages/Admin.module.css';

const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return 'n/a';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Storage management for the event/telemetry tables: table sizes, telemetry
 * retention policy, prune action, and the BigQuery export state.
 */
function UsageStoragePanel({ storage, retention, exportState }) {
    const queryClient = useQueryClient();
    const [retentionDays, setRetentionDays] = useState(retention?.product_events_days ?? 180);

    useEffect(() => {
        if (retention?.product_events_days) {
            setRetentionDays(retention.product_events_days);
        }
    }, [retention?.product_events_days]);

    const retentionMutation = useMutation({
        mutationFn: (days) => adminApi.updateUsageRetention({ product_events_days: days }),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'usage'] });
            notify.success(`Telemetry retention set to ${response.data.product_events_days} days`);
        },
        onError: (error) => notify.error(`Failed to update retention: ${formatError(error)}`),
    });

    const pruneMutation = useMutation({
        mutationFn: () => adminApi.pruneUsage({}),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'usage'] });
            notify.success(`Pruned ${response.data.deleted} telemetry events older than ${response.data.older_than_days} days`);
        },
        onError: (error) => notify.error(`Failed to prune telemetry: ${formatError(error)}`),
    });

    const handlePrune = () => {
        const confirmed = window.confirm(
            `Delete product telemetry events older than the retention window (${retention?.product_events_days ?? 180} days)? Exported BigQuery data is unaffected.`,
        );
        if (confirmed) {
            pruneMutation.mutate();
        }
    };

    const tables = storage?.tables || [];
    const exportTables = exportState?.tables || {};

    return (
        <>
            <h3>Event storage</h3>
            <table className={styles.table}>
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

            <div className={styles.userCreator}>
                <label htmlFor="telemetry-retention-days">Telemetry retention (days)</label>
                <input
                    id="telemetry-retention-days"
                    type="number"
                    min="30"
                    max="730"
                    value={retentionDays}
                    onChange={(event) => setRetentionDays(event.target.value)}
                />
                <button
                    type="button"
                    onClick={() => retentionMutation.mutate(Number(retentionDays))}
                    disabled={retentionMutation.isPending}
                >
                    Save Retention
                </button>
                <button
                    type="button"
                    onClick={handlePrune}
                    disabled={pruneMutation.isPending}
                >
                    {pruneMutation.isPending ? 'Pruning...' : 'Prune Telemetry'}
                </button>
            </div>

            <p>
                Last BigQuery export:{' '}
                {exportState?.last_run_at
                    ? `${formatDateTime(exportState.last_run_at)} (${exportState.last_run_status || 'unknown'})`
                    : 'Never exported'}
            </p>
        </>
    );
}

export default UsageStoragePanel;
