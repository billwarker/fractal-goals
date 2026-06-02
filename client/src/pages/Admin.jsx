import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { adminApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import notify from '../utils/notify';
import { formatError } from '../utils/mutationNotify';
import styles from './Admin.module.css';

const ADMIN_USERS_KEY = ['admin', 'users'];
const ADMIN_SUMMARY_KEY = ['admin', 'summary'];
const ADMIN_INVITES_KEY = ['admin', 'invite-keys'];

const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Never';
const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return 'unlimited';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes) || 0;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

function UsageBar({ label, used, limit }) {
    const unlimited = limit === null || limit === undefined;
    const percent = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
    return (
        <div className={styles.usageCard}>
            <div className={styles.usageHeader}>
                <span>{label}</span>
                <span>{used} / {unlimited ? 'unlimited' : limit}</span>
            </div>
            <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
}

function StorageEditor({ user }) {
    const queryClient = useQueryClient();
    const [draftMb, setDraftMb] = useState(() => String(Math.round((user.storage_limit_bytes ?? 0) / 1048576)));
    const mutation = useMutation({
        mutationFn: () => adminApi.updateUser(user.id, {
            storage_limit_bytes: Math.max(0, Number(draftMb || 0)) * 1048576,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('Storage limit updated');
        },
        onError: (error) => notify.error(`Failed to update storage: ${formatError(error)}`),
    });
    return (
        <div className={styles.storageEditor}>
            <input
                value={draftMb}
                onChange={(event) => setDraftMb(event.target.value)}
                type="number"
                min="0"
                aria-label={`Storage limit for ${user.username}`}
            />
            <span>MB</span>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</button>
        </div>
    );
}

function UserRow({ user, onDelete }) {
    const [expanded, setExpanded] = useState(false);
    const navigate = useNavigate();
    const resources = user.resources || Object.keys(user.usage || {});
    const labels = user.labels || {};
    const storage = user.storage || {};
    const storageLimit = storage.limit_bytes ?? user.storage_limit_bytes;
    const storagePercent = storageLimit ? Math.min(100, Math.round((storage.used_bytes / storageLimit) * 100)) : 100;

    const openFractal = (rootId, mode) => {
        navigate(`/${rootId}/goals?admin_user_id=${user.id}&admin_mode=${mode}`);
    };

    return (
        <>
            <tr>
                <td>
                    <button className={styles.expandButton} onClick={() => setExpanded((value) => !value)}>
                        {expanded ? '-' : '+'}
                    </button>
                </td>
                <td>
                    <strong>{user.username}</strong>
                    <div className={styles.muted}>{user.email}</div>
                </td>
                <td>{user.role}</td>
                <td>{user.is_active ? 'Active' : 'Disabled'}</td>
                <td>{formatDate(user.created_at)}</td>
                <td>{formatDate(user.last_login_at)}</td>
                <td>{user.membership_tier}</td>
                <td>{user.fractals?.length || 0}</td>
                <td>
                    <div>{formatBytes(storage.used_bytes)} / {formatBytes(storageLimit)}</div>
                    <button className={styles.dangerButton} onClick={() => onDelete(user)}>Delete User</button>
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td />
                    <td colSpan="8">
                        <div className={styles.expandedPanel}>
                            <div className={styles.quotaGrid}>
                                {resources.map((resource) => (
                                    <UsageBar
                                        key={resource}
                                        label={labels[resource] || resource.replace(/_/g, ' ')}
                                        used={user.usage?.[resource] ?? 0}
                                        limit={user.limits?.[resource]}
                                    />
                                ))}
                                <div className={styles.usageCard}>
                                    <div className={styles.usageHeader}>
                                        <span>Storage</span>
                                        <span>{formatBytes(storage.used_bytes)} / {formatBytes(storageLimit)}</span>
                                    </div>
                                    <div className={styles.barTrack}>
                                        <div className={styles.barFill} style={{ width: `${storagePercent}%` }} />
                                    </div>
                                    <StorageEditor user={user} />
                                </div>
                            </div>
                            <table className={styles.subTable}>
                                <thead>
                                    <tr>
                                        <th>Fractal</th>
                                        <th>Created</th>
                                        <th>Goals</th>
                                        <th>Sessions</th>
                                        <th>Status</th>
                                        <th>Access</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(user.fractals || []).map((fractal) => (
                                        <tr key={fractal.id}>
                                            <td>{fractal.name}</td>
                                            <td>{formatDate(fractal.created_at)}</td>
                                            <td>{fractal.goal_count}</td>
                                            <td>{fractal.session_count}</td>
                                            <td>{fractal.completed ? 'Complete' : 'Active'}</td>
                                            <td className={styles.rowActions}>
                                                <button onClick={() => openFractal(fractal.id, 'read_only')}>Read</button>
                                                <button onClick={() => openFractal(fractal.id, 'read_write')}>Write</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function Admin() {
    const { user, loading } = useAuth();
    const [tab, setTab] = useState('overview');
    const [search, setSearch] = useState('');
    const [newKey, setNewKey] = useState(null);
    const [inviteLabel, setInviteLabel] = useState('');
    const [createdPassword, setCreatedPassword] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [userDraft, setUserDraft] = useState({
        username: '',
        email: '',
        storage_limit_mb: '100',
    });
    const queryClient = useQueryClient();

    const summaryQuery = useQuery({
        queryKey: ADMIN_SUMMARY_KEY,
        queryFn: async () => (await adminApi.getSummary()).data,
        enabled: Boolean(user?.is_admin),
    });
    const usersQuery = useQuery({
        queryKey: [...ADMIN_USERS_KEY, search],
        queryFn: async () => (await adminApi.getUsers({ search })).data,
        enabled: Boolean(user?.is_admin),
    });
    const invitesQuery = useQuery({
        queryKey: ADMIN_INVITES_KEY,
        queryFn: async () => (await adminApi.getInviteKeys()).data,
        enabled: Boolean(user?.is_admin),
    });

    const createInviteMutation = useMutation({
        mutationFn: () => adminApi.createInviteKey({ label: inviteLabel }),
        onSuccess: (res) => {
            setNewKey(res.data.key);
            setInviteLabel('');
            queryClient.invalidateQueries({ queryKey: ADMIN_INVITES_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
        },
        onError: (error) => notify.error(`Failed to create invite key: ${formatError(error)}`),
    });

    const revokeInviteMutation = useMutation({
        mutationFn: (inviteId) => adminApi.revokeInviteKey(inviteId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_INVITES_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
        },
        onError: (error) => notify.error(`Failed to revoke invite key: ${formatError(error)}`),
    });

    const createUserMutation = useMutation({
        mutationFn: () => adminApi.createUser({
            username: userDraft.username,
            email: userDraft.email,
            storage_limit_bytes: Math.max(0, Number(userDraft.storage_limit_mb || 0)) * 1048576,
        }),
        onSuccess: (res) => {
            setCreatedPassword(res.data.temporary_password);
            setUserDraft({ username: '', email: '', storage_limit_mb: '100' });
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('User created');
        },
        onError: (error) => notify.error(`Failed to create user: ${formatError(error)}`),
    });

    const deleteUserMutation = useMutation({
        mutationFn: (targetUserId) => adminApi.deleteUser(targetUserId),
        onSuccess: () => {
            setUserToDelete(null);
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('User deleted');
        },
        onError: (error) => notify.error(`Failed to delete user: ${formatError(error)}`),
    });

    const summaryCards = useMemo(() => {
        const summary = summaryQuery.data || {};
        return [
            ['Users', summary.total_users || 0],
            ['Active Users', summary.active_users || 0],
            ['Fractals', summary.total_fractals || 0],
            ['Sessions', summary.total_sessions || 0],
            ['Storage', formatBytes(summary.storage_bytes || 0)],
            ['Invite Keys', summary.invite_keys?.available || 0],
        ];
    }, [summaryQuery.data]);

    if (loading) return <div className={styles.status}>Loading...</div>;
    if (!user?.is_admin) return <Navigate to="/" replace />;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1>Admin</h1>
                    <p>Users, tester onboarding, quotas, and storage controls.</p>
                </div>
                <Link to="/" className={styles.homeLink}>Home</Link>
            </header>

            <div className={styles.tabs}>
                {['overview', 'users', 'invite keys'].map((item) => (
                    <button
                        key={item}
                        className={tab === item ? styles.activeTab : ''}
                        onClick={() => setTab(item)}
                    >
                        {item}
                    </button>
                ))}
            </div>

            {tab === 'overview' && (
                <section className={styles.section}>
                    <div className={styles.summaryGrid}>
                        {summaryCards.map(([label, value]) => (
                            <div key={label} className={styles.summaryCard}>
                                <span>{label}</span>
                                <strong>{value}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {tab === 'users' && (
                <section className={styles.section}>
                    <input
                        className={styles.search}
                        placeholder="Search users"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className={styles.userCreator}>
                        <input
                            placeholder="Username"
                            value={userDraft.username}
                            onChange={(event) => setUserDraft((draft) => ({ ...draft, username: event.target.value }))}
                        />
                        <input
                            placeholder="Email"
                            type="email"
                            value={userDraft.email}
                            onChange={(event) => setUserDraft((draft) => ({ ...draft, email: event.target.value }))}
                        />
                        <input
                            aria-label="New user storage limit"
                            type="number"
                            min="0"
                            value={userDraft.storage_limit_mb}
                            onChange={(event) => setUserDraft((draft) => ({ ...draft, storage_limit_mb: event.target.value }))}
                        />
                        <span>MB</span>
                        <button
                            onClick={() => createUserMutation.mutate()}
                            disabled={createUserMutation.isPending || !userDraft.username || !userDraft.email}
                        >
                            Add User
                        </button>
                    </div>
                    {createdPassword && (
                        <div className={styles.generatedKey}>
                            <span>Temporary password: {createdPassword}</span>
                            <button onClick={() => navigator.clipboard?.writeText(createdPassword)}>Copy</button>
                        </div>
                    )}
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th />
                                <th>User</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Last Login</th>
                                <th>Tier</th>
                                <th>Fractals</th>
                                <th>Storage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(usersQuery.data?.users || []).map((item) => (
                                <UserRow key={item.id} user={item} onDelete={setUserToDelete} />
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {tab === 'invite keys' && (
                <section className={styles.section}>
                    <div className={styles.inviteCreator}>
                        <input
                            placeholder="Label"
                            value={inviteLabel}
                            onChange={(event) => setInviteLabel(event.target.value)}
                        />
                        <button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
                            Generate
                        </button>
                    </div>
                    {newKey && (
                        <div className={styles.generatedKey}>
                            <span>{newKey}</span>
                            <button onClick={() => navigator.clipboard?.writeText(newKey)}>Copy</button>
                        </div>
                    )}
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Label</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Used</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {(invitesQuery.data || []).map((invite) => (
                                <tr key={invite.id}>
                                    <td>{invite.label || 'Tester invite'}</td>
                                    <td>{invite.status}</td>
                                    <td>{formatDate(invite.created_at)}</td>
                                    <td>{formatDate(invite.used_at)}</td>
                                    <td>
                                        {invite.status === 'available' && (
                                            <button onClick={() => revokeInviteMutation.mutate(invite.id)}>Revoke</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <DeleteConfirmModal
                isOpen={Boolean(userToDelete)}
                onClose={() => setUserToDelete(null)}
                onConfirm={() => {
                    if (userToDelete) {
                        deleteUserMutation.mutate(userToDelete.id);
                    }
                }}
                title="Delete User?"
                message={`This will disable and anonymize "${userToDelete?.username}" and prevent future login. Their data remains in the database for referential safety. This action cannot be undone from the admin console.`}
                requireMatchingText="delete"
                confirmText={deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
            />
        </div>
    );
}

export default Admin;
