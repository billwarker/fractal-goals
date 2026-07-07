import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import styles from '../../pages/Admin.module.css';

const ADMIN_BETA_SIGNUPS_KEY = ['admin', 'beta-signups'];

const BETA_STATUS_FILTERS = [
    { key: '', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'invited', label: 'Invited' },
    { key: 'dismissed', label: 'Dismissed' },
];
const BETA_NEXT_STATUS = ['new', 'invited', 'dismissed'];

const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Never';

export default function BetaSignupsPanel({ enabled }) {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    const betaSignupsQuery = useQuery({
        queryKey: [...ADMIN_BETA_SIGNUPS_KEY, statusFilter, search],
        queryFn: async () => (await adminApi.getBetaSignups({
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(search ? { q: search } : {}),
        })).data,
        enabled,
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => adminApi.updateBetaSignupStatus(id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_BETA_SIGNUPS_KEY });
            notify.success('Beta signup updated');
        },
        onError: (error) => notify.error(`Failed to update signup: ${formatError(error)}`),
    });

    const inviteMutation = useMutation({
        mutationFn: (id) => adminApi.sendBetaSignupInvite(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_BETA_SIGNUPS_KEY });
            notify.success('Beta invite sent');
        },
        onError: (error) => notify.error(`Failed to send invite: ${formatError(error)}`),
    });

    const requests = betaSignupsQuery.data?.requests || [];
    const counts = betaSignupsQuery.data?.status_counts || {};

    const copyAllEmails = async () => {
        const emails = requests.map((request) => request.email).filter(Boolean).join(', ');
        if (!emails) {
            notify.error('No emails to copy');
            return;
        }
        try {
            await navigator.clipboard?.writeText(emails);
            notify.success(`Copied ${requests.length} email${requests.length === 1 ? '' : 's'}`);
        } catch {
            notify.error('Could not copy to clipboard');
        }
    };

    const exportCsv = async () => {
        try {
            const response = await adminApi.exportBetaSignupsCsv({
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(search ? { q: search } : {}),
            });
            const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'beta-signups.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            notify.error(`Failed to export CSV: ${formatError(error)}`);
        }
    };

    return (
        <section className={styles.section}>
            <div className={styles.betaSignupControls}>
                <div className={styles.betaStatusFilters}>
                    {BETA_STATUS_FILTERS.map((filter) => {
                        const count = filter.key === '' ? counts.total : counts[filter.key];
                        return (
                            <button
                                key={filter.key || 'all'}
                                className={statusFilter === filter.key ? styles.activeTab : ''}
                                onClick={() => setStatusFilter(filter.key)}
                            >
                                {filter.label}{typeof count === 'number' ? ` (${count})` : ''}
                            </button>
                        );
                    })}
                </div>
                <input
                    className={styles.search}
                    placeholder="Search email or goal"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <div className={styles.betaSignupActions}>
                    <button onClick={copyAllEmails} disabled={requests.length === 0}>Copy all emails</button>
                    <button onClick={exportCsv} disabled={requests.length === 0}>Export CSV</button>
                </div>
            </div>

            {betaSignupsQuery.isPending ? (
                <p className={styles.status}>Loading beta signups...</p>
            ) : requests.length === 0 ? (
                <p className={styles.status}>No beta signups yet.</p>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Goal</th>
                            <th>Status</th>
                            <th>Source</th>
                            <th>Requested</th>
                            <th>Last Invite</th>
                            <th>Email Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((request) => (
                            <tr key={request.id}>
                                <td>{request.email}</td>
                                <td>{request.use_case || '-'}</td>
                                <td>
                                    <select
                                        value={request.status}
                                        onChange={(event) => statusMutation.mutate({ id: request.id, status: event.target.value })}
                                        disabled={statusMutation.isPending}
                                    >
                                        {BETA_NEXT_STATUS.map((status) => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>{request.source}</td>
                                <td>{formatDate(request.created_at)}</td>
                                <td>{formatDate(request.last_invite_email_sent_at)}</td>
                                <td>{request.invite_email_status || '-'}</td>
                                <td>
                                    <button
                                        onClick={() => inviteMutation.mutate(request.id)}
                                        disabled={inviteMutation.isPending}
                                    >
                                        Send invite
                                    </button>
                                    <button onClick={() => navigator.clipboard?.writeText(request.email)}>Copy email</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
