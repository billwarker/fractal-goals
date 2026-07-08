import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
    ACCOUNT_TIERS,
    DEFAULT_ACCOUNT_TIER,
} from '../constants/accountTiers';
import BetaSignupsPanel from '../components/admin/BetaSignupsPanel';
import TierQuotasPanel from '../components/admin/TierQuotasPanel';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangleIcon } from '../components/atoms/AppIcons';
import CloseButton from '../components/atoms/CloseButton';
import ModalBackdrop from '../components/atoms/ModalBackdrop';
import { queryKeys } from '../hooks/queryKeys';
import { adminApi } from '../utils/api';
import notify from '../utils/notify';
import { formatError } from '../utils/mutationNotify';
import { getLandingPageHref } from '../utils/marketingHost';
import styles from './Admin.module.css';

const ADMIN_USERS_KEY = ['admin', 'users'];
const ADMIN_SUMMARY_KEY = ['admin', 'summary'];
const ADMIN_INVITES_KEY = ['admin', 'invite-keys'];
const ADMIN_TIER_QUOTAS_KEY = ['admin', 'tier-quotas'];
const ADMIN_FEATURE_FLAGS_KEY = ['admin', 'feature-flags'];
const ADMIN_LANDING_EXAMPLES_KEY = ['admin', 'landing-examples'];
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
    const tierDefaults = defaults[tier] ?? defaults[DEFAULT_ACCOUNT_TIER] ?? {};
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

const EMPTY_LANDING_SHOWCASE = {
    session_id: null,
    activity_ids: [],
    program_id: null,
    program_start_date: null,
    program_end_date: null,
    analytics_view_ids: [],
};
const LANDING_SHOWCASE_ACTIVITY_CAP = 4;
const LANDING_SHOWCASE_ANALYTICS_VIEW_CAP = 3;

const normalizeShowcase = (showcase) => ({
    ...EMPTY_LANDING_SHOWCASE,
    ...(showcase || {}),
    activity_ids: (showcase?.activity_ids || []).slice(0, LANDING_SHOWCASE_ACTIVITY_CAP),
    analytics_view_ids: (showcase?.analytics_view_ids || []).slice(0, LANDING_SHOWCASE_ANALYTICS_VIEW_CAP),
});

function LandingExampleShowcaseEditor({ example, onShowcaseChange }) {
    const [expanded, setExpanded] = useState(false);
    const showcase = normalizeShowcase(example.showcase);

    const optionsQuery = useQuery({
        queryKey: ['admin', 'landing-example-options', example.root_id],
        queryFn: async () => (await adminApi.getLandingExampleOptions(example.root_id)).data,
        enabled: expanded,
        staleTime: 60 * 1000,
    });

    const options = optionsQuery.data;
    const update = (patch) => onShowcaseChange(example.root_id, { ...showcase, ...patch });

    const toggleActivity = (activityId) => {
        const next = showcase.activity_ids.includes(activityId)
            ? showcase.activity_ids.filter((id) => id !== activityId)
            : [...showcase.activity_ids, activityId].slice(0, LANDING_SHOWCASE_ACTIVITY_CAP);
        update({ activity_ids: next });
    };

    const toggleAnalyticsView = (viewId) => {
        const next = showcase.analytics_view_ids.includes(viewId)
            ? showcase.analytics_view_ids.filter((id) => id !== viewId)
            : [...showcase.analytics_view_ids, viewId].slice(0, LANDING_SHOWCASE_ANALYTICS_VIEW_CAP);
        update({ analytics_view_ids: next });
    };

    const selectedProgram = (options?.programs || []).find((program) => program.id === showcase.program_id) || null;
    const summaryBits = [
        showcase.session_id ? 'session' : null,
        showcase.activity_ids.length ? `${showcase.activity_ids.length} activities` : null,
        showcase.program_id ? 'program window' : null,
        showcase.analytics_view_ids.length ? `${showcase.analytics_view_ids.length} analytics views` : null,
    ].filter(Boolean);

    return (
        <div className={styles.landingShowcaseEditor}>
            <button
                type="button"
                className={styles.landingShowcaseToggle}
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
            >
                {expanded ? '▾' : '▸'} Showcase picks
                <span>{summaryBits.length ? summaryBits.join(', ') : 'auto'}</span>
            </button>
            {expanded && (
                optionsQuery.isLoading ? (
                    <div className={styles.status}>Loading showcase options...</div>
                ) : optionsQuery.isError ? (
                    <div className={styles.status}>Failed to load showcase options.</div>
                ) : (
                    <div className={styles.landingShowcaseFields}>
                        <label>
                            <span>Featured session</span>
                            <select
                                value={showcase.session_id || ''}
                                onChange={(event) => update({ session_id: event.target.value || null })}
                            >
                                <option value="">Auto (most recent)</option>
                                {(options?.sessions || []).map((session) => (
                                    <option value={session.id} key={session.id}>
                                        {session.name} — {session.session_start ? new Date(session.session_start).toLocaleDateString() : 'undated'}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <fieldset>
                            <legend>Featured activities (max {LANDING_SHOWCASE_ACTIVITY_CAP})</legend>
                            {(options?.activities || []).length === 0 && (
                                <div className={styles.status}>No activities in this fractal.</div>
                            )}
                            {(options?.activities || []).map((activity) => {
                                const checked = showcase.activity_ids.includes(activity.id);
                                const capped = !checked && showcase.activity_ids.length >= LANDING_SHOWCASE_ACTIVITY_CAP;
                                return (
                                    <label className={styles.landingShowcaseCheck} key={activity.id}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={capped}
                                            onChange={() => toggleActivity(activity.id)}
                                        />
                                        <span>
                                            {activity.name}
                                            {activity.associated_goal_count === 0 && (
                                                <em title="No goal links: the inheritance demo would be empty">
                                                    <AlertTriangleIcon size={12} />
                                                    <span>no goal links</span>
                                                </em>
                                            )}
                                        </span>
                                    </label>
                                );
                            })}
                        </fieldset>

                        <label>
                            <span>Featured program</span>
                            <select
                                value={showcase.program_id || ''}
                                onChange={(event) => {
                                    const programId = event.target.value || null;
                                    const program = (options?.programs || []).find((item) => item.id === programId);
                                    update({
                                        program_id: programId,
                                        program_start_date: program?.start_date?.slice(0, 10) || null,
                                        program_end_date: program?.end_date?.slice(0, 10) || null,
                                    });
                                }}
                            >
                                <option value="">Auto (first program)</option>
                                {(options?.programs || []).map((program) => (
                                    <option value={program.id} key={program.id}>{program.name}</option>
                                ))}
                            </select>
                        </label>
                        {showcase.program_id && (
                            <div className={styles.landingShowcaseDates}>
                                <label>
                                    <span>Window start</span>
                                    <input
                                        type="date"
                                        value={showcase.program_start_date || ''}
                                        min={selectedProgram?.start_date?.slice(0, 10)}
                                        max={showcase.program_end_date || selectedProgram?.end_date?.slice(0, 10)}
                                        onChange={(event) => update({ program_start_date: event.target.value || null })}
                                    />
                                </label>
                                <label>
                                    <span>Window end</span>
                                    <input
                                        type="date"
                                        value={showcase.program_end_date || ''}
                                        min={showcase.program_start_date || selectedProgram?.start_date?.slice(0, 10)}
                                        max={selectedProgram?.end_date?.slice(0, 10)}
                                        onChange={(event) => update({ program_end_date: event.target.value || null })}
                                    />
                                </label>
                            </div>
                        )}

                        <fieldset>
                            <legend>Analytics views (max {LANDING_SHOWCASE_ANALYTICS_VIEW_CAP})</legend>
                            {(options?.analytics_views || []).length === 0 && (
                                <div className={styles.status}>No saved analytics views in this fractal.</div>
                            )}
                            {(options?.analytics_views || []).map((view) => {
                                const checked = showcase.analytics_view_ids.includes(view.id);
                                const capped = !checked
                                    && showcase.analytics_view_ids.length >= LANDING_SHOWCASE_ANALYTICS_VIEW_CAP;
                                return (
                                    <label className={styles.landingShowcaseCheck} key={view.id}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={capped}
                                            onChange={() => toggleAnalyticsView(view.id)}
                                        />
                                        <span>{view.name || 'Untitled analytics view'}</span>
                                    </label>
                                );
                            })}
                        </fieldset>
                    </div>
                )
            )}
        </div>
    );
}

function LandingExamplesPanel() {
    const queryClient = useQueryClient();
    const [draftExamples, setDraftExamples] = useState([]);

    const landingExamplesQuery = useQuery({
        queryKey: ADMIN_LANDING_EXAMPLES_KEY,
        queryFn: async () => (await adminApi.getLandingExamples()).data,
    });

    React.useEffect(() => {
        if (!landingExamplesQuery.data) return;
        setDraftExamples((landingExamplesQuery.data.examples || []).map((example, index) => ({
            root_id: example.root_id,
            label: example.label,
            sort_order: example.sort_order ?? index,
            showcase: normalizeShowcase(example.showcase),
        })));
    }, [landingExamplesQuery.data]);

    const eligibleFractals = landingExamplesQuery.data?.eligible_fractals || [];
    const selectedRootIds = new Set(draftExamples.map((example) => example.root_id));
    const sortedDraftExamples = [...draftExamples].sort((left, right) => (
        (left.sort_order ?? 0) - (right.sort_order ?? 0)
    ));

    const normalizeDraft = (examples) => examples.map((example, index) => ({
        root_id: example.root_id,
        label: example.label,
        sort_order: index,
        showcase: normalizeShowcase(example.showcase),
    }));

    const updateMutation = useMutation({
        mutationFn: (examples) => adminApi.updateLandingExamples({ examples: normalizeDraft(examples) }),
        onSuccess: (res) => {
            queryClient.setQueryData(ADMIN_LANDING_EXAMPLES_KEY, res.data);
            notify.success('Landing examples saved');
        },
        onError: (error) => notify.error(`Failed to save landing examples: ${formatError(error)}`),
    });

    const publishMutation = useMutation({
        mutationFn: () => adminApi.publishLandingExamples({ examples: normalizeDraft(sortedDraftExamples) }),
        onSuccess: (res) => {
            queryClient.setQueryData(ADMIN_LANDING_EXAMPLES_KEY, (current) => ({
                ...(current || {}),
                examples: normalizeDraft(sortedDraftExamples),
                published_at: res.data.published_at,
                published_example_count: res.data.published_example_count,
            }));
            notify.success('Landing examples published');
            (res.data.showcase_warnings || []).forEach((warning) => notify.error(warning));
            if (res.data.static_snapshot === 'failed') {
                notify.error('Published, but writing the static landing snapshot failed; the API fallback is still live.');
            }
            if (res.data.cache_warm === 'failed') {
                notify.error('Published, but warming the landing edge cache failed; it will refresh on its own within ~5 minutes.');
            }
        },
        onError: (error) => notify.error(`Failed to publish landing examples: ${formatError(error)}`),
    });

    const updateShowcase = (rootId, showcase) => {
        setDraftExamples((current) => current.map((example) => (
            example.root_id === rootId ? { ...example, showcase: normalizeShowcase(showcase) } : example
        )));
    };

    const addExample = (fractal) => {
        setDraftExamples((current) => normalizeDraft([
            ...current,
            {
                root_id: fractal.root_id,
                label: fractal.name,
                sort_order: current.length,
            },
        ]));
    };

    const removeExample = (rootId) => {
        setDraftExamples((current) => normalizeDraft(current.filter((example) => example.root_id !== rootId)));
    };

    const moveExample = (rootId, direction) => {
        setDraftExamples((current) => {
            const next = normalizeDraft([...current]);
            const index = next.findIndex((example) => example.root_id === rootId);
            const targetIndex = index + direction;
            if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return current;
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return normalizeDraft(next);
        });
    };

    const updateLabel = (rootId, label) => {
        setDraftExamples((current) => current.map((example) => (
            example.root_id === rootId ? { ...example, label } : example
        )));
    };

    const canSave = sortedDraftExamples.every((example) => example.label.trim().length > 0);

    if (landingExamplesQuery.isLoading) {
        return <div className={styles.status}>Loading landing examples...</div>;
    }

    if (landingExamplesQuery.isError) {
        return <div className={styles.status}>Failed to load landing examples.</div>;
    }

    return (
        <section className={styles.section}>
            <div className={styles.landingExamplesHeader}>
                <div>
                    <h2>Landing Examples</h2>
                    <p>Choose admin-owned fractals to publish as read-only examples on the public landing page.</p>
                    <a className={styles.landingExamplesPageLink} href={getLandingPageHref()} target="_blank" rel="noreferrer">
                        View landing page
                    </a>
                </div>
                <div className={styles.landingExamplesPublishMeta}>
                    <span>Published</span>
                    <strong>{formatDate(landingExamplesQuery.data?.published_at)}</strong>
                    <span>{landingExamplesQuery.data?.published_example_count || 0} examples live</span>
                </div>
            </div>

            <div className={styles.landingExamplesGrid}>
                <div className={styles.landingExamplesPanel}>
                    <div className={styles.landingExamplesPanelHeader}>
                        <h3>Selected examples</h3>
                        <span>{sortedDraftExamples.length} selected</span>
                    </div>
                    {sortedDraftExamples.length === 0 ? (
                        <div className={styles.status}>No landing examples selected.</div>
                    ) : (
                        <div className={styles.landingExampleList}>
                            {sortedDraftExamples.map((example, index) => {
                                const fractal = eligibleFractals.find((item) => item.root_id === example.root_id);
                                return (
                                    <div className={styles.landingExampleItem} key={example.root_id}>
                                        <div>
                                            <strong>{fractal?.name || 'Missing fractal'}</strong>
                                            <span>{example.root_id}</span>
                                        </div>
                                        <label>
                                            <span>Public label</span>
                                            <input
                                                value={example.label}
                                                onChange={(event) => updateLabel(example.root_id, event.target.value)}
                                            />
                                        </label>
                                        <div className={styles.landingExampleActions}>
                                            <button
                                                onClick={() => moveExample(example.root_id, -1)}
                                                disabled={index === 0}
                                                aria-label={`Move ${example.label} up`}
                                            >
                                                Up
                                            </button>
                                            <button
                                                onClick={() => moveExample(example.root_id, 1)}
                                                disabled={index === sortedDraftExamples.length - 1}
                                                aria-label={`Move ${example.label} down`}
                                            >
                                                Down
                                            </button>
                                            <button onClick={() => removeExample(example.root_id)}>Remove</button>
                                        </div>
                                        <LandingExampleShowcaseEditor
                                            example={example}
                                            onShowcaseChange={updateShowcase}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className={styles.landingExamplesFooter}>
                        <button
                            onClick={() => updateMutation.mutate(sortedDraftExamples)}
                            disabled={updateMutation.isPending || !canSave}
                        >
                            {updateMutation.isPending ? 'Saving...' : 'Save Draft'}
                        </button>
                        <button
                            onClick={() => publishMutation.mutate()}
                            disabled={publishMutation.isPending || !canSave}
                        >
                            {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                        </button>
                    </div>
                </div>

                <div className={styles.landingExamplesPanel}>
                    <div className={styles.landingExamplesPanelHeader}>
                        <h3>Eligible admin fractals</h3>
                        <span>{eligibleFractals.length} available</span>
                    </div>
                    <div className={styles.landingExampleList}>
                        {eligibleFractals.map((fractal) => (
                            <div className={styles.landingFractalOption} key={fractal.root_id}>
                                <div>
                                    <strong>{fractal.name}</strong>
                                    <span>Updated {formatDate(fractal.updated_at)}</span>
                                </div>
                                <button
                                    onClick={() => addExample(fractal)}
                                    disabled={selectedRootIds.has(fractal.root_id)}
                                >
                                    {selectedRootIds.has(fractal.root_id) ? 'Selected' : 'Add'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function FeatureFlagsPanel() {
    const queryClient = useQueryClient();
    const featureFlagsQuery = useQuery({
        queryKey: ADMIN_FEATURE_FLAGS_KEY,
        queryFn: async () => (await adminApi.getFeatureFlags()).data,
    });

    const mutation = useMutation({
        mutationFn: ({ key, enabled }) => adminApi.updateFeatureFlags({ flags: { [key]: enabled } }),
        onSuccess: (res) => {
            queryClient.setQueryData(ADMIN_FEATURE_FLAGS_KEY, res.data);
            queryClient.setQueryData(queryKeys.featureFlags(), res.data.flags || {});
            notify.success('Feature flag updated');
        },
        onError: (error) => notify.error(`Failed to update feature flag: ${formatError(error)}`),
    });

    if (featureFlagsQuery.isLoading) {
        return <div className={styles.status}>Loading feature flags...</div>;
    }

    if (featureFlagsQuery.isError) {
        return <div className={styles.status}>Failed to load feature flags.</div>;
    }

    const definitions = featureFlagsQuery.data?.definitions || [];

    return (
        <section className={styles.section}>
            <div className={styles.featureFlagsHeader}>
                <h2>Feature Flags</h2>
                <p>Control access to experimental or high-complexity app surfaces.</p>
            </div>
            <div className={styles.featureFlagList}>
                {definitions.map((flag) => (
                    <div className={styles.featureFlagItem} key={flag.key}>
                        <div>
                            <strong>{flag.label}</strong>
                            <span>{flag.description}</span>
                        </div>
                        <label className={styles.featureFlagSwitch}>
                            <input
                                type="checkbox"
                                aria-label={flag.label}
                                checked={Boolean(flag.enabled)}
                                disabled={mutation.isPending}
                                onChange={(event) => mutation.mutate({
                                    key: flag.key,
                                    enabled: event.target.checked,
                                })}
                            />
                            <span>{flag.enabled ? 'On' : 'Off'}</span>
                        </label>
                    </div>
                ))}
            </div>
        </section>
    );
}

function UserActionsModal({ user, isOpen, onClose, onAction, isPending, generatedPassword }) {
    const [activeTab, setActiveTab] = useState('account');
    const [tierDraft, setTierDraft] = useState(user?.membership_tier || DEFAULT_ACCOUNT_TIER);
    const [roleDraft, setRoleDraft] = useState(user?.role || 'user');
    const [storageDraftMb, setStorageDraftMb] = useState('0');
    const [quotaDraft, setQuotaDraft] = useState('{}');
    const [softConfirm, setSoftConfirm] = useState('');
    const [hardConfirm, setHardConfirm] = useState('');

    React.useEffect(() => {
        if (!user) return;
        setTierDraft(user.membership_tier || DEFAULT_ACCOUNT_TIER);
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
        <ModalBackdrop className={styles.actionsOverlay} onClose={onClose} aria-modal="true" role="dialog">
            <div className={styles.actionsShell} onClick={(event) => event.stopPropagation()}>
                <div className={styles.actionsHeader}>
                    <h2>Actions for {user.username}</h2>
                    <CloseButton onClick={onClose} className={styles.actionsCloseButton} aria-label="Close user actions" />
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
                                                {ACCOUNT_TIERS.map((tier) => (
                                                    <option key={tier} value={tier}>{tier}</option>
                                                ))}
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
        </ModalBackdrop>
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
    const [inviteEmail, setInviteEmail] = useState('');
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
        mutationFn: () => adminApi.createInviteKey({ label: inviteLabel, email: inviteEmail }),
        onSuccess: (res) => {
            setNewKey(res.data.key);
            setInviteLabel('');
            setInviteEmail('');
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
                {['overview', 'users', 'beta signups', 'tier quotas', 'feature flags', 'landing', 'invite keys'].map((item) => (
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

            {tab === 'beta signups' && (
                <BetaSignupsPanel enabled={Boolean(user?.is_admin) && tab === 'beta signups'} />
            )}

            {tab === 'tier quotas' && (
                <TierQuotasPanel tierQuotasQuery={tierQuotasQuery} />
            )}

            {tab === 'feature flags' && (
                <FeatureFlagsPanel />
            )}

            {tab === 'landing' && (
                <LandingExamplesPanel />
            )}

            {tab === 'invite keys' && (
                <section className={styles.section}>
                    <div className={styles.inviteCreator}>
                        <input
                            placeholder="Email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                        />
                        <input
                            placeholder="Label"
                            value={inviteLabel}
                            onChange={(event) => setInviteLabel(event.target.value)}
                        />
                        <button
                            onClick={() => createInviteMutation.mutate()}
                            disabled={createInviteMutation.isPending || !inviteEmail.trim()}
                        >
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
                                <th>Email</th>
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
                                    <td>{invite.assigned_email || 'Any email'}</td>
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
