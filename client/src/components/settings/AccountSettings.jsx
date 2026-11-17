import React from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useGoals } from '../../contexts/GoalsContext';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import Input from '../atoms/Input';
import LoadingState from '../common/LoadingState';
import SettingsSection, { SettingsRow } from './SettingsSection';
import styles from './AccountSettings.module.css';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function UsageItem({ row }) {
    const limited = row.limit !== null;
    return (
        <li className={styles.usageItem}>
            <span className={styles.usageLabel}>{capitalize(row.label)}</span>
            <span className={styles.usageValue}>
                {row.used.toLocaleString()}
                <span className={styles.usageLimit}>{limited ? ` of ${row.limit.toLocaleString()}` : ' · no limit'}</span>
            </span>
            {limited && (
                <span
                    className={styles.meter}
                    role="meter"
                    aria-label={`${row.label} used`}
                    aria-valuemin={0}
                    aria-valuemax={row.limit}
                    aria-valuenow={row.used}
                    data-near-limit={row.percent >= 90 || undefined}
                >
                    <span style={{ width: `${row.percent}%` }} />
                </span>
            )}
        </li>
    );
}

/** A fractal's root goal icon, styled by its level as on the fractal list. */
function FractalRootIcon({ fractal }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const level = fractal.display_level || null;
    return (
        <GoalIcon
            shape={level?.icon || getGoalIcon(fractal.type) || 'circle'}
            color={level?.color || getGoalColor(fractal.type)}
            secondaryColor={level?.secondary_color || getGoalSecondaryColor(fractal.type)}
            isSmart={Boolean(fractal.is_smart)}
            size={18}
        />
    );
}

function MembershipSection({ account }) {
    const { activeRootId } = useGoals();
    const {
        accountUsage, availableFractals, fractalsLoading, selectedQuotaRootIds,
        setSelectedQuotaRootIds, quotaRows, displayTier, displayStatus, quotaScopeLabel, handleQuotaRootToggle,
    } = account;

    return (
        <>
            <SettingsSection title="Plan">
                <SettingsRow
                    label={`${capitalize(displayTier)} plan`}
                    description={`Subscription: ${displayStatus.replace(/_/g, ' ')}`}
                />
            </SettingsSection>

            <SettingsSection title="Usage" description="What counts toward your plan’s limits.">
                {/* A failed request is reported by a toast (useAccountSettings). */}
                {!accountUsage && <LoadingState variant="inline" label="Loading usage…" />}
                {accountUsage && (
                    <>
                        <fieldset className={styles.scope}>
                            <legend className={styles.scopeTitle}>
                                Count from <span>{quotaScopeLabel}</span>
                            </legend>
                            <ul className={styles.scopeOptions}>
                                <li>
                                    <label className={styles.scopeOption}>
                                        <input
                                            type="checkbox"
                                            checked={selectedQuotaRootIds.length === 0}
                                            onChange={() => setSelectedQuotaRootIds([])}
                                        />
                                        <span className={styles.scopeIcon} aria-hidden="true" />
                                        <span className={styles.scopeName}>All fractals</span>
                                    </label>
                                </li>
                                {availableFractals.map((fractal) => (
                                    <li key={fractal.id}>
                                        <label className={styles.scopeOption}>
                                            <input
                                                type="checkbox"
                                                checked={selectedQuotaRootIds.includes(fractal.id)}
                                                onChange={() => handleQuotaRootToggle(fractal.id)}
                                            />
                                            <span className={styles.scopeIcon} aria-hidden="true">
                                                <FractalRootIcon fractal={fractal} />
                                            </span>
                                            <span className={styles.scopeName}>{fractal.name}</span>
                                            {fractal.id === activeRootId ? <span className={styles.scopeCurrent}>Current</span> : null}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            {fractalsLoading && <LoadingState variant="inline" label="Loading fractals…" />}
                        </fieldset>

                        <ul className={styles.usage} aria-label="Usage">
                            {quotaRows.map((row) => <UsageItem key={row.resource} row={row} />)}
                        </ul>
                    </>
                )}
            </SettingsSection>
        </>
    );
}

/** Settings → Account: membership, sign-in details, data export and deletion. */
function AccountSettings() {
    const account = useAccountSettings('account');
    const {
        user, passwordData, setPasswordData, emailData, setEmailData, deleteData, setDeleteData,
        exportPassword, setExportPassword, isExporting, handlePasswordUpdate, handleEmailUpdate,
        handleExportData, handleDeleteAccount, handleCancelDeletion, handleSignOutEverywhere,
    } = account;

    return (
        <>
            <MembershipSection account={account} />

            <SettingsSection title="Password">
                <form onSubmit={handlePasswordUpdate} className={styles.form}>
                    <Input
                        label="Current password"
                        type="password"
                        autoComplete="current-password"
                        value={passwordData.current_password}
                        onChange={(event) => setPasswordData({ ...passwordData, current_password: event.target.value })}
                        required
                    />
                    <Input
                        label="New password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={passwordData.new_password}
                        onChange={(event) => setPasswordData({ ...passwordData, new_password: event.target.value })}
                        required
                        minLength={8}
                    />
                    <Button type="submit" size="sm" className={styles.submit}>Update password</Button>
                </form>
            </SettingsSection>

            <SettingsSection title="Email">
                <form onSubmit={handleEmailUpdate} className={styles.form}>
                    <Input
                        label="New email address"
                        type="email"
                        autoComplete="email"
                        value={emailData.email}
                        onChange={(event) => setEmailData({ ...emailData, email: event.target.value })}
                        required
                    />
                    <Input
                        label="Current password"
                        type="password"
                        autoComplete="current-password"
                        value={emailData.password}
                        onChange={(event) => setEmailData({ ...emailData, password: event.target.value })}
                        required
                    />
                    <Button type="submit" size="sm" className={styles.submit}>Update email</Button>
                </form>
            </SettingsSection>

            <SettingsSection title="Signed-in devices">
                <SettingsRow
                    label="Sign out everywhere"
                    description="Ends every session, including this one."
                >
                    <Button variant="secondary" size="sm" onClick={handleSignOutEverywhere}>Sign out of all devices</Button>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                title="Your data"
                description="Download a portable copy of your goals and their completion conditions, sessions, activities, programs and notes."
            >
                <form onSubmit={handleExportData} className={styles.form}>
                    <Input
                        label="Current password"
                        type="password"
                        autoComplete="current-password"
                        value={exportPassword}
                        onChange={(event) => setExportPassword(event.target.value)}
                        required
                    />
                    <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        className={styles.submit}
                        disabled={!exportPassword}
                        isLoading={isExporting}
                    >
                        Download my data
                    </Button>
                </form>
            </SettingsSection>

            <SettingsSection
                title="Delete account"
                tone="danger"
                description="Your account stays available for a 30-day grace period, then it and everything in it are permanently deleted. You can cancel here during the grace period. Download your data first."
            >
                {user?.erasure_requested_at ? (
                    <Button size="sm" className={styles.submit} onClick={handleCancelDeletion}>Cancel scheduled deletion</Button>
                ) : (
                    <form onSubmit={handleDeleteAccount} className={styles.form}>
                        <Input
                            label="Current password"
                            type="password"
                            autoComplete="current-password"
                            value={deleteData.password}
                            onChange={(event) => setDeleteData({ ...deleteData, password: event.target.value })}
                            required
                        />
                        <Input
                            label="Type DELETE to confirm"
                            value={deleteData.confirmation}
                            onChange={(event) => setDeleteData({ ...deleteData, confirmation: event.target.value })}
                            autoComplete="off"
                            required
                        />
                        <Button
                            type="submit"
                            variant="danger"
                            size="sm"
                            className={styles.submit}
                            disabled={deleteData.confirmation !== 'DELETE'}
                        >
                            Delete account
                        </Button>
                    </form>
                )}
            </SettingsSection>
        </>
    );
}

export default AccountSettings;
