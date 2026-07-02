import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
    DEFAULT_ACCOUNT_TIER,
    FINITE_QUOTA_TIERS,
    UNLIMITED_QUOTA_TIERS,
} from '../../constants/accountTiers';
import { adminApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import styles from '../../pages/Admin.module.css';

const ADMIN_USERS_KEY = ['admin', 'users'];
const ADMIN_SUMMARY_KEY = ['admin', 'summary'];
const ADMIN_TIER_QUOTAS_KEY = ['admin', 'tier-quotas'];

const formatQuotaJson = (value) => JSON.stringify(value || {}, null, 2);

export default function TierQuotasPanel({ tierQuotasQuery }) {
    const queryClient = useQueryClient();
    const [selectedTier, setSelectedTier] = useState(DEFAULT_ACCOUNT_TIER);
    const [quotaDraft, setQuotaDraft] = useState('{}');
    const [storageDraftMb, setStorageDraftMb] = useState('100');
    const [applyExistingUsers, setApplyExistingUsers] = useState(false);

    const tierDefaultLimits = tierQuotasQuery.data?.tier_default_limits || {};
    const tierStorageLimitBytes = tierQuotasQuery.data?.tier_storage_limit_bytes || {};
    const tierOptions = useMemo(() => Object.keys(tierDefaultLimits), [tierDefaultLimits]);
    const editableTiers = tierQuotasQuery.data?.editable_tiers || FINITE_QUOTA_TIERS;
    const unlimitedTiers = tierQuotasQuery.data?.unlimited_tiers || UNLIMITED_QUOTA_TIERS;
    const selectedTierIsUnlimited = unlimitedTiers.includes(selectedTier);

    React.useEffect(() => {
        if (!tierQuotasQuery.data) return;
        if (!Object.prototype.hasOwnProperty.call(tierDefaultLimits, selectedTier)) {
            setSelectedTier(editableTiers[0] || tierOptions[0] || DEFAULT_ACCOUNT_TIER);
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
