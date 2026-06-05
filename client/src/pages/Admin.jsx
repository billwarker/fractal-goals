import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { adminApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import notify from '../utils/notify';
import { formatError } from '../utils/mutationNotify';
import styles from './Admin.module.css';

const ADMIN_USERS_KEY = ['admin', 'users'];
const ADMIN_SUMMARY_KEY = ['admin', 'summary'];
const ADMIN_INVITES_KEY = ['admin', 'invite-keys'];
const ADMIN_TIER_QUOTAS_KEY = ['admin', 'tier-quotas'];
const QUOTA_PLACEHOLDER = '{"goals": 100, "sessions": 500}';

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
const formatQuotaJson = (value) => JSON.stringify(value || {}, null, 2);
const getTierDefaultQuotas = (user, tier) => {
    const defaults = user?.tier_default_limits || {};
    const tierDefaults = defaults[tier] ?? defaults.free ?? {};
    return tierDefaults || {};
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

function TierQuotasPanel({ tierQuotasQuery }) {
    const queryClient = useQueryClient();
    const [selectedTier, setSelectedTier] = useState('free');
    const [quotaDraft, setQuotaDraft] = useState('{}');
    const [storageDraftMb, setStorageDraftMb] = useState('100');
    const [applyExistingUsers, setApplyExistingUsers] = useState(false);

    const tierDefaultLimits = tierQuotasQuery.data?.tier_default_limits || {};
    const tierStorageLimitBytes = tierQuotasQuery.data?.tier_storage_limit_bytes || {};
    const tierOptions = useMemo(() => Object.keys(tierDefaultLimits), [tierDefaultLimits]);
    const editableTiers = tierQuotasQuery.data?.editable_tiers || ['free', 'paid'];
    const unlimitedTiers = tierQuotasQuery.data?.unlimited_tiers || ['legacy'];
    const selectedTierIsUnlimited = unlimitedTiers.includes(selectedTier);

    React.useEffect(() => {
        if (!tierQuotasQuery.data) return;
        if (!Object.prototype.hasOwnProperty.call(tierDefaultLimits, selectedTier)) {
            setSelectedTier(editableTiers[0] || tierOptions[0] || 'free');
            return;
        }
        const limits = tierDefaultLimits[selectedTier];
        setQuotaDraft(limits === null || limits === undefined ? 'null' : formatQuotaJson(limits));
        const storageBytes = tierStorageLimitBytes[selectedTier];
        setStorageDraftMb(storageBytes === null || storageBytes === undefined ? 'unlimited' : String(Math.round(storageBytes / 1048576)));
    }, [editableTiers, selectedTier, tierDefaultLimits, tierOptions, tierQuotasQuery.data, tierStorageLimitBytes]);

    const mutation = useMutation({
        mutationFn: () => {
            const parsed = JSON.parse(quotaDraft);
            return adminApi.updateTierQuotas({
                tier: selectedTier,
                limits: parsed,
                storage_limit_bytes: Math.max(0, Number(storageDraftMb || 0)) * 1048576,
                apply_existing_users: applyExistingUsers,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_TIER_QUOTAS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('Tier quotas updated');
        },
        onError: (error) => notify.error(`Failed to update tier quotas: ${formatError(error)}`),
    });

    const saveTierQuotas = () => {
        if (selectedTierIsUnlimited || !editableTiers.includes(selectedTier)) {
            notify.error('Legacy tier is unlimited and cannot be assigned finite default quotas');
            return;
        }
        try {
            const parsed = JSON.parse(quotaDraft);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                notify.error('Tier quota JSON must be an object');
                return;
            }
        } catch {
                notify.error('Tier quota JSON must be valid JSON');
                return;
            }
        const storageMb = Number(storageDraftMb);
        if (!Number.isFinite(storageMb) || storageMb < 0) {
            notify.error('Storage MB must be a non-negative number');
            return;
        }
        mutation.mutate();
    };

    if (tierQuotasQuery.isLoading) {
        return <div className={styles.status}>Loading tier quotas...</div>;
    }

    if (tierQuotasQuery.isError) {
        return <div className={styles.status}>Failed to load tier quotas.</div>;
    }

    return (
        <section className={styles.section}>
            <div className={styles.tierQuotaEditor}>
                <div className={styles.tierQuotaHeader}>
                    <div>
                        <h2>Tier Quotas</h2>
                        <p>Manage default resource quotas for account tiers.</p>
                    </div>
                    <label>
                        <span>Tier</span>
                        <select value={selectedTier} onChange={(event) => setSelectedTier(event.target.value)}>
                            {tierOptions.map((tier) => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <label className={styles.tierQuotaStorageField}>
                    <span>Default Storage MB</span>
                    <input
                        type="number"
                        min="0"
                        value={storageDraftMb}
                        onChange={(event) => setStorageDraftMb(event.target.value)}
                        disabled={selectedTierIsUnlimited}
                    />
                </label>

                <label className={styles.tierQuotaJsonField}>
                    <span>Default Quotas JSON</span>
                    <textarea
                        value={quotaDraft}
                        onChange={(event) => setQuotaDraft(event.target.value)}
                        rows={12}
                        disabled={selectedTierIsUnlimited}
                    />
                </label>

                {selectedTierIsUnlimited ? (
                    <div className={styles.tierQuotaNotice}>
                        Legacy remains unlimited. Use user-specific quota overrides if an individual legacy account needs finite limits.
                    </div>
                ) : (
                    <div className={styles.tierQuotaApplyPanel}>
                        <label>
                            <input
                                type="radio"
                                name="tier-quota-apply"
                                checked={!applyExistingUsers}
                                onChange={() => setApplyExistingUsers(false)}
                            />
                            <span>New users only</span>
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier-quota-apply"
                                checked={applyExistingUsers}
                                onChange={() => setApplyExistingUsers(true)}
                            />
                            <span>Apply to existing users in this tier</span>
                        </label>
                    </div>
                )}

                <button
                    className={styles.tierQuotaSaveButton}
                    onClick={saveTierQuotas}
                    disabled={mutation.isPending || selectedTierIsUnlimited}
                >
                    {mutation.isPending ? 'Saving...' : 'Save Tier Quotas'}
                </button>
            </div>
        </section>
    );
}

function UserActionsModal({ user, isOpen, onClose, onAction, isPending, generatedPassword }) {
    const [activeTab, setActiveTab] = useState('account');
    const [tierDraft, setTierDraft] = useState(user?.membership_tier || 'free');
    const [roleDraft, setRoleDraft] = useState(user?.role || 'user');
    const [storageDraftMb, setStorageDraftMb] = useState('0');
    const [quotaDraft, setQuotaDraft] = useState('{}');
    const [softConfirm, setSoftConfirm] = useState('');
    const [hardConfirm, setHardConfirm] = useState('');

    React.useEffect(() => {
        if (!user) return;
        setTierDraft(user.membership_tier || 'free');
        setRoleDraft(user.role || 'user');
        setStorageDraftMb(String(Math.round((user.storage_limit_bytes ?? 0) / 1048576)));
        setQuotaDraft(formatQuotaJson(user.limits || user.quota_overrides || {}));
        setSoftConfirm('');
        setHardConfirm('');
        setActiveTab('account');
    }, [user]);

    React.useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleEsc = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose]);

    if (!user || !isOpen) return null;

    const submitQuota = () => {
        try {
            const parsed = quotaDraft.trim() ? JSON.parse(quotaDraft) : {};
            onAction('quota', {
                quota_overrides: parsed,
                storage_limit_bytes: Math.max(0, Number(storageDraftMb || 0)) * 1048576,
            });
        } catch {
            notify.error('Quota overrides must be valid JSON');
        }
    };

    const resetQuotaToTierDefaults = () => {
        setQuotaDraft(formatQuotaJson(getTierDefaultQuotas(user, tierDraft)));
        onAction('quota', {
            quota_overrides: {},
            storage_limit_bytes: Math.max(0, Number(storageDraftMb || 0)) * 1048576,
        });
    };

    const tabs = [
        ['account', 'Account'],
        ['quota', 'Quota'],
        ['access', 'Access'],
        ['password', 'Password'],
        ['destructive', 'Destructive'],
    ];

    return (
        <div className={styles.actionsOverlay} onClick={onClose} aria-modal="true" role="dialog">
            <div className={styles.actionsShell} onClick={(event) => event.stopPropagation()}>
                <div className={styles.actionsHeader}>
                    <h2>Actions for {user.username}</h2>
                    <button onClick={onClose} className={styles.actionsCloseButton} aria-label="Close user actions">
                        &times;
                    </button>
                </div>
                <div className={styles.actionsBody}>
                    <aside className={styles.actionsSidebar}>
                        <div className={styles.actionsTabMenu}>
                            {tabs.map(([key, label]) => (
                                <button
                                    key={key}
                                    className={`${styles.actionsTab} ${activeTab === key ? styles.actionsTabActive : ''}`}
                                    onClick={() => setActiveTab(key)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className={styles.actionsUserSummary}>
                            <strong>{user.email}</strong>
                            <span>{user.is_active ? 'Active' : 'Suspended'} · {user.membership_tier}</span>
                        </div>
                    </aside>

                    <div className={styles.actionsContentArea}>
                        {activeTab === 'account' && (
                            <section className={styles.actionsTabContent}>
                                <h3 className={styles.actionsSectionTitle}>Account</h3>
                                <div className={styles.actionsFormStack}>
                                    <div className={styles.actionsControlRow}>
                                        <label>
                                            <span>Tier</span>
                                            <select value={tierDraft} onChange={(event) => setTierDraft(event.target.value)}>
                                                <option value="free">free</option>
                                                <option value="paid">paid</option>
                                                <option value="legacy">legacy</option>
                                            </select>
                                        </label>
                                        <button
                                            onClick={() => onAction('tier', { membership_tier: tierDraft })}
                                            disabled={isPending}
                                        >
                                            Upgrade Tier
                                        </button>
                                    </div>
                                    <div className={styles.actionsControlRow}>
                                        <label>
                                            <span>Role</span>
                                            <select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)}>
                                                <option value="user">user</option>
                                                <option value="admin">admin</option>
                                            </select>
                                        </label>
                                        <button
                                            onClick={() => onAction('role', { role: roleDraft })}
                                            disabled={isPending}
                                        >
                                            Update Role
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}

                        {activeTab === 'quota' && (
                            <section className={styles.actionsTabContent}>
                                <h3 className={styles.actionsSectionTitle}>Quota</h3>
                                <p className={styles.actionsDescription}>Update storage and resource overrides for this user.</p>
                                <div className={styles.actionsFormStack}>
                                    <label className={styles.actionsField}>
                                        <span>Storage MB</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={storageDraftMb}
                                            onChange={(event) => setStorageDraftMb(event.target.value)}
                                        />
                                    </label>
                                    <label className={styles.actionsField}>
                                        <span>Quota overrides JSON</span>
                                        <textarea
                                            value={quotaDraft}
                                            onChange={(event) => setQuotaDraft(event.target.value)}
                                            placeholder={QUOTA_PLACEHOLDER}
                                            rows={8}
                                        />
                                    </label>
                                    <button className={styles.actionsPrimaryButton} onClick={submitQuota} disabled={isPending}>
                                        Upgrade Quotas
                                    </button>
                                    <button onClick={resetQuotaToTierDefaults} disabled={isPending}>
                                        Reset to Tier Defaults
                                    </button>
                                </div>
                            </section>
                        )}

                        {activeTab === 'access' && (
                            <section className={styles.actionsTabContent}>
                                <h3 className={styles.actionsSectionTitle}>Access</h3>
                                <p className={styles.actionsDescription}>
                                    Status: {user.is_active ? 'Active' : 'Suspended'} · Failed logins: {user.failed_login_count || 0}
                                </p>
                                <div className={styles.actionsButtonStack}>
                                    <button
                                        onClick={() => onAction('status', { is_active: !user.is_active })}
                                        disabled={isPending}
                                    >
                                        {user.is_active ? 'Suspend Account' : 'Reactivate Account'}
                                    </button>
                                    <button onClick={() => onAction('unlock')} disabled={isPending}>Unlock Account</button>
                                    <button
                                        onClick={() => onAction('forcePasswordChange', { force_password_change: !user.force_password_change })}
                                        disabled={isPending}
                                    >
                                        {user.force_password_change ? 'Clear Password Change' : 'Force Password Change'}
                                    </button>
                                </div>
                            </section>
                        )}

                        {activeTab === 'password' && (
                            <section className={styles.actionsTabContent}>
                                <h3 className={styles.actionsSectionTitle}>Password</h3>
                                <p className={styles.actionsDescription}>Generate a temporary password and mark the account for password-change follow-up.</p>
                                <div className={styles.actionsButtonStack}>
                                    <button onClick={() => onAction('temporaryPassword')} disabled={isPending}>
                                        Generate Temporary Password
                                    </button>
                                </div>
                                {generatedPassword && (
                                    <div className={styles.generatedKey}>
                                        <span>Temporary password: {generatedPassword}</span>
                                        <button onClick={() => navigator.clipboard?.writeText(generatedPassword)}>Copy</button>
                                    </div>
                                )}
                            </section>
                        )}

                        {activeTab === 'destructive' && (
                            <section className={`${styles.actionsTabContent} ${styles.actionsDangerContent}`}>
                                <h3 className={styles.actionsSectionTitle}>Destructive</h3>
                                <p className={styles.actionsDescription}>Soft delete disables and anonymizes. Hard delete removes the user and owned records.</p>
                                <div className={styles.actionsFormStack}>
                                    <div className={styles.actionsControlRow}>
                                        <label>
                                            <span>Type soft delete</span>
                                            <input
                                                value={softConfirm}
                                                onChange={(event) => setSoftConfirm(event.target.value)}
                                                placeholder="soft delete"
                                            />
                                        </label>
                                        <button
                                            className={styles.dangerButton}
                                            onClick={() => onAction('softDelete')}
                                            disabled={isPending || softConfirm !== 'soft delete'}
                                        >
                                            Soft Delete User
                                        </button>
                                    </div>
                                    <div className={styles.actionsControlRow}>
                                        <label>
                                            <span>Type hard delete {user.username}</span>
                                            <input
                                                value={hardConfirm}
                                                onChange={(event) => setHardConfirm(event.target.value)}
                                                placeholder={`hard delete ${user.username}`}
                                            />
                                        </label>
                                        <button
                                            className={styles.dangerButton}
                                            onClick={() => onAction('hardDelete')}
                                            disabled={isPending || hardConfirm !== `hard delete ${user.username}`}
                                        >
                                            Hard Delete User
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function UserRow({ user, onActions }) {
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
                </td>
                <td>
                    <button onClick={() => onActions(user)}>Actions</button>
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td />
                    <td colSpan="9">
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
    const [selectedUser, setSelectedUser] = useState(null);
    const [generatedUserPassword, setGeneratedUserPassword] = useState(null);
    const [userDraft, setUserDraft] = useState({
        username: '',
        email: '',
        storage_limit_mb: '',
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
    const tierQuotasQuery = useQuery({
        queryKey: ADMIN_TIER_QUOTAS_KEY,
        queryFn: async () => (await adminApi.getTierQuotas()).data,
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
        mutationFn: () => {
            const payload = {
                username: userDraft.username,
                email: userDraft.email,
            };
            if (userDraft.storage_limit_mb !== '') {
                payload.storage_limit_bytes = Math.max(0, Number(userDraft.storage_limit_mb || 0)) * 1048576;
            }
            return adminApi.createUser(payload);
        },
        onSuccess: (res) => {
            setCreatedPassword(res.data.temporary_password);
            setUserDraft({ username: '', email: '', storage_limit_mb: '' });
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('User created');
        },
        onError: (error) => notify.error(`Failed to create user: ${formatError(error)}`),
    });

    const adminActionMutation = useMutation({
        mutationFn: ({ action, targetUserId, data }) => {
            if (action === 'softDelete') return adminApi.softDeleteUser(targetUserId);
            if (action === 'hardDelete') return adminApi.hardDeleteUser(targetUserId);
            if (action === 'temporaryPassword') return adminApi.generateTemporaryPassword(targetUserId);
            if (action === 'tier') return adminApi.updateUserTier(targetUserId, data);
            if (action === 'quota') return adminApi.updateUserQuota(targetUserId, data);
            if (action === 'status') return adminApi.updateUserStatus(targetUserId, data);
            if (action === 'unlock') return adminApi.unlockUser(targetUserId);
            if (action === 'forcePasswordChange') return adminApi.forcePasswordChange(targetUserId, data);
            if (action === 'role') return adminApi.updateUserRole(targetUserId, data);
            throw new Error(`Unknown admin action: ${action}`);
        },
        onSuccess: (res, variables) => {
            if (variables.action === 'temporaryPassword') {
                setGeneratedUserPassword(res.data.temporary_password);
            } else {
                setGeneratedUserPassword(null);
            }
            if (variables.action === 'softDelete' || variables.action === 'hardDelete') {
                setSelectedUser(null);
            }
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
            queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY });
            notify.success('User action completed');
        },
        onError: (error) => notify.error(`Failed to update user: ${formatError(error)}`),
    });

    const runUserAction = (action, data) => {
        if (!selectedUser) return;
        adminActionMutation.mutate({ action, targetUserId: selectedUser.id, data });
    };

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
                {['overview', 'users', 'tier quotas', 'invite keys'].map((item) => (
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
                            placeholder="Tier default"
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
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(usersQuery.data?.users || []).map((item) => (
                                <UserRow
                                    key={item.id}
                                    user={item}
                                    onActions={(targetUser) => {
                                        setSelectedUser(targetUser);
                                        setGeneratedUserPassword(null);
                                    }}
                                />
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {tab === 'tier quotas' && (
                <TierQuotasPanel tierQuotasQuery={tierQuotasQuery} />
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

            <UserActionsModal
                user={selectedUser}
                isOpen={Boolean(selectedUser)}
                onClose={() => {
                    setSelectedUser(null);
                    setGeneratedUserPassword(null);
                }}
                onAction={runUserAction}
                isPending={adminActionMutation.isPending}
                generatedPassword={generatedUserPassword}
            />
        </div>
    );
}

export default Admin;
