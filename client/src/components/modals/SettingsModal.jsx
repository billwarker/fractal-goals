import React, { useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useGoals } from '../../contexts/GoalsContext';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';
import Modal from '../atoms/Modal';
import useIsMobile from '../../hooks/useIsMobile';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import {
    MAX_ACTIVE_GOAL_WINDOW_DAYS,
    MIN_ACTIVE_GOAL_WINDOW_DAYS,
    normalizeActiveGoalWindowDays,
} from '../../hooks/useFlowTreeMetrics';
import {
    getAvailableTimezones,
} from './settingsModalUtils';
import styles from './SettingsModal.module.css';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import OnboardingSettingsPanel from '../onboarding/OnboardingSettingsPanel';
import AgentConnectionsPanel from '../agent/AgentConnectionsPanel';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';

const SETTINGS_TABS = [
    { id: 'general', label: 'General' },
    { id: 'styling', label: 'Goal Characteristics' },
    { id: 'account', label: 'Account' },
    { id: 'ai-connections', label: 'AI Connections' },
];

const SettingsModalInner = ({ onClose }) => {
    const {
        theme,
        toggleTheme,
        animatedIcons,
        toggleAnimatedIcons
    } = useTheme();

    const { preference, setPreference } = useTimezone();

    const [activeTab, setActiveTab] = useState('general');
    const { user, accountUsage, accountUsageLoading, availableFractals, fractalsLoading, selectedQuotaRootIds, setSelectedQuotaRootIds, passwordData, setPasswordData, emailData, setEmailData, deleteData, setDeleteData, exportPassword, setExportPassword, isExporting, quotaRows, displayTier, displayStatus, quotaScopeLabel, handleQuotaRootToggle, handlePasswordUpdate, handleEmailUpdate, handleExportData, handleDeleteAccount, handleCancelDeletion } = useAccountSettings(activeTab);
    const { activeRootId } = useGoals();
    const isMobile = useIsMobile();
    const { flags } = useFeatureFlags();
    const connectorsEnabled = isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentConnectors);
    const onboarding = useOptionalOnboarding();
    const [availableTimezones] = useState(getAvailableTimezones);
    const { progressSettings, activeGoalWindowDays, updateProgressSettings } = useRootProgressSettings(activeRootId);
    const progressEnabled = progressSettings?.enabled !== false;
    const [activeGoalWindowDraft, setActiveGoalWindowDraft] = useState(String(activeGoalWindowDays));

    useEffect(() => {
        setActiveGoalWindowDraft(String(activeGoalWindowDays));
    }, [activeGoalWindowDays]);

    const handleProgressEnabledToggle = async (e) => {
        try {
            await updateProgressSettings({ ...(progressSettings || {}), enabled: e.target.checked });
        } catch (err) {
            notify.error(`Failed to update progress settings: ${formatError(err)}`);
        }
    };

    const handleActiveGoalWindowChange = (e) => {
        setActiveGoalWindowDraft(e.target.value);
    };

    const handleActiveGoalWindowCommit = async () => {
        const normalizedDays = normalizeActiveGoalWindowDays(activeGoalWindowDraft);
        setActiveGoalWindowDraft(String(normalizedDays));
        if (normalizedDays === activeGoalWindowDays) {
            return;
        }
        try {
            await updateProgressSettings({
                ...(progressSettings || {}),
                active_goal_window_days: normalizedDays,
            });
        } catch (err) {
            notify.error(`Failed to update active goal window: ${formatError(err)}`);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Settings" size="lg" className={styles.modalShell}>
                <div className={`${styles.body} ${isMobile ? styles.bodyMobile : styles.bodyDesktop}`}>
                    {/* Sidebar */}
                    <div className={`${styles.sidebar} ${isMobile ? styles.sidebarMobile : styles.sidebarDesktop}`}>
                        <nav
                            aria-label="Settings sections"
                            className={`${styles.tabMenu} ${isMobile ? styles.tabMenuMobile : styles.tabMenuDesktop}`}
                        >
                            {[...SETTINGS_TABS, ...(onboarding?.enabled ? [{ id: 'getting-started', label: 'Getting Started' }] : [])]
                                .map(({ id, label }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        aria-pressed={activeTab === id}
                                        onClick={() => setActiveTab(id)}
                                        className={`${styles.tab} ${isMobile ? styles.tabMobile : styles.tabDesktop} ${activeTab === id ? styles.tabActive : styles.tabInactive} ${activeTab === id ? (isMobile ? styles.tabActiveMobile : styles.tabActiveDesktop) : (isMobile ? styles.tabInactiveMobile : styles.tabInactiveDesktop)}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                        </nav>

                        {/* Legal Footer in Sidebar */}
                        {!isMobile && (
                            <div className={styles.legalFooter}>
                                <a
                                    href="/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${styles.legalLink} ${styles.legalLinkMargin}`}
                                >
                                    Privacy Policy
                                </a>
                                <a
                                    href="/terms"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.legalLink}
                                >
                                    Terms of Service
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Content Area */}
                    <div className={`${styles.contentArea} ${isMobile ? styles.contentAreaMobile : styles.contentAreaDesktop}`}>
                        {activeTab === 'general' && (
                            <div className={styles.tabContent}>
                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Regional
                                    </h3>
                                    <div className={styles.sectionContentStack}>
                                        <div className={styles.checkboxRow}>
                                            <input
                                                type="checkbox"
                                                id="match-system-tz"
                                                checked={preference === 'local'}
                                                onChange={(e) => {
                                                    if (e.target.checked) setPreference('local');
                                                    else setPreference(Intl.DateTimeFormat().resolvedOptions().timeZone);
                                                }}
                                                className={styles.checkboxInput}
                                            />
                                            <label htmlFor="match-system-tz" className={styles.checkboxLabel}>
                                                Match System Timezone
                                                <span className={styles.checkboxDescription}>
                                                    Always use the timezone from your device settings ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                                                </span>
                                            </label>
                                        </div>

                                        <div className={styles.themeRow} style={{ opacity: preference === 'local' ? 0.5 : 1, pointerEvents: preference === 'local' ? 'none' : 'auto' }}>
                                            <select
                                                id="tz-select"
                                                value={preference === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : preference}
                                                onChange={(e) => setPreference(e.target.value)}
                                                className={styles.selectInput}
                                                disabled={preference === 'local'}
                                            >
                                                {availableTimezones.map(tz => (
                                                    <option key={tz} value={tz}>{tz}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Interface Theme
                                    </h3>
                                    <div className={`${styles.themeRow} ${isMobile ? styles.themeRowMobile : styles.themeRowDesktop}`}>
                                        <div className={styles.themeText}>
                                            Current Mode: <strong>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</strong>
                                        </div>
                                        <button
                                            onClick={toggleTheme}
                                            className={styles.secondaryButton}
                                        >
                                            Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
                                        </button>
                                    </div>
                                </section>

                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Animated Icons
                                    </h3>
                                    <div className={styles.checkboxRow}>
                                        <input
                                            type="checkbox"
                                            id="animated-icons-toggle"
                                            checked={animatedIcons}
                                            onChange={toggleAnimatedIcons}
                                            className={styles.checkboxInput}
                                        />
                                        <label htmlFor="animated-icons-toggle" className={styles.checkboxLabel}>
                                            Enable fractal animations on goal icons
                                            <span className={styles.checkboxDescription}>
                                                When disabled, static icons will be used instead
                                            </span>
                                        </label>
                                    </div>
                                </section>

                                {activeRootId && (
                                    <section>
                                        <h3 className={styles.sectionTitle}>
                                            Fractal Activity
                                        </h3>
                                        <div className={styles.sectionContentStack}>
                                            <div className={styles.themeRow}>
                                                <label htmlFor="active-goal-window-days" className={`${styles.checkboxLabel} ${styles.labelSpacing}`}>
                                                    Active goal window
                                                    <span className={styles.checkboxDescription}>
                                                        Goals show as active when contributed activity was completed within this many days
                                                    </span>
                                                </label>
                                                <input
                                                    id="active-goal-window-days"
                                                    type="number"
                                                    min={MIN_ACTIVE_GOAL_WINDOW_DAYS}
                                                    max={MAX_ACTIVE_GOAL_WINDOW_DAYS}
                                                    step="1"
                                                    value={activeGoalWindowDraft}
                                                    onChange={handleActiveGoalWindowChange}
                                                    onBlur={handleActiveGoalWindowCommit}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        }
                                                    }}
                                                    className={styles.selectInput}
                                                />
                                            </div>

                                            <h3 className={styles.sectionTitle}>
                                                Progress Tracking
                                            </h3>
                                            <div className={styles.checkboxRow}>
                                                <input
                                                    type="checkbox"
                                                    id="progress-enabled-toggle"
                                                    checked={progressEnabled}
                                                    onChange={handleProgressEnabledToggle}
                                                    className={styles.checkboxInput}
                                                />
                                                <label htmlFor="progress-enabled-toggle" className={styles.checkboxLabel}>
                                                    Enable progress comparisons
                                                    <span className={styles.checkboxDescription}>
                                                        When disabled, no progress comparisons are computed for this fractal
                                                    </span>
                                                </label>
                                            </div>

                                            <div className={styles.themeRow}>
                                                <label className={`${styles.checkboxLabel} ${styles.labelSpacing}`}>
                                                    Delta display format
                                                    <span className={styles.checkboxDescription}>
                                                        How instance-to-instance progress changes are shown
                                                    </span>
                                                </label>
                                                <select
                                                    value={progressSettings?.delta_display_mode || 'percent'}
                                                    onChange={async (e) => {
                                                        try {
                                                            await updateProgressSettings({ ...(progressSettings || {}), delta_display_mode: e.target.value });
                                                        } catch (err) {
                                                            notify.error(`Failed to update progress settings: ${formatError(err)}`);
                                                        }
                                                    }}
                                                    disabled={!progressEnabled}
                                                    className={styles.selectInput}
                                                >
                                                    <option value="percent">Percent (▲12%)</option>
                                                    <option value="absolute">Absolute (+5)</option>
                                                </select>
                                            </div>

                                        </div>
                                    </section>
                                )}
                            </div>
                        )}

                        {activeTab === 'styling' && (
                            <div className={styles.tabContent}>
                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Goal Characteristics {activeRootId ? '(This Fractal)' : '(Global)'}
                                    </h3>
                                    <GoalCharacteristicsSettings scope={activeRootId || 'default'} />
                                </section>
                            </div>
                        )}

                        {activeTab === 'getting-started' && onboarding && (
                            <div className={styles.tabContent}>
                                <OnboardingSettingsPanel onboarding={onboarding} />
                            </div>
                        )}

                        {activeTab === 'ai-connections' && (
                            <div className={styles.tabContent}>
                                <AgentConnectionsPanel enabled={connectorsEnabled} />
                            </div>
                        )}

                        {activeTab === 'account' && (
                            <div className={styles.tabContent}>
                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Membership
                                    </h3>
                                    <div className={styles.membershipPanel}>
                                        <div>
                                            <div className={styles.membershipTier}>
                                                {displayTier.charAt(0).toUpperCase() + displayTier.slice(1)}
                                            </div>
                                            <div className={styles.membershipStatus}>
                                                Subscription: {displayStatus.replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                        {accountUsageLoading && (
                                            <span className={styles.membershipStatus}>Loading usage...</span>
                                        )}
                                    </div>

                                    {accountUsage && (
                                        <>
                                            <div className={styles.quotaFilterPanel}>
                                                <div className={styles.quotaFilterHeader}>
                                                    <span className={styles.quotaFilterTitle}>Quota counts</span>
                                                    <span className={styles.quotaFilterSummary}>{quotaScopeLabel}</span>
                                                </div>
                                                <div className={styles.quotaCheckboxList}>
                                                    <label className={styles.quotaCheckboxItem}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedQuotaRootIds.length === 0}
                                                            onChange={() => setSelectedQuotaRootIds([])}
                                                            className={styles.checkboxInput}
                                                        />
                                                        <span>All fractals</span>
                                                    </label>
                                                    {availableFractals.map((fractal) => (
                                                        <label key={fractal.id} className={styles.quotaCheckboxItem}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedQuotaRootIds.includes(fractal.id)}
                                                                onChange={() => handleQuotaRootToggle(fractal.id)}
                                                                className={styles.checkboxInput}
                                                            />
                                                            <span>
                                                                {fractal.name}
                                                                {fractal.id === activeRootId ? ' (current)' : ''}
                                                            </span>
                                                        </label>
                                                    ))}
                                                    {fractalsLoading && (
                                                        <span className={styles.membershipStatus}>Loading fractals...</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.quotaGrid}>
                                                {quotaRows.map((row) => (
                                                    <div key={row.resource} className={styles.quotaRow}>
                                                        <div className={styles.quotaHeader}>
                                                            <span className={styles.quotaLabel}>{row.label}</span>
                                                            <span className={styles.quotaValue}>
                                                                {row.limit === null ? `${row.used} / unlimited` : `${row.used} / ${row.limit}`}
                                                            </span>
                                                        </div>
                                                        <div className={styles.quotaBarTrack}>
                                                            <div
                                                                className={styles.quotaBarFill}
                                                                style={{ width: row.limit === null ? '100%' : `${row.percent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </section>

                                {/* Change Password */}
                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Change Password
                                    </h3>
                                    <form onSubmit={handlePasswordUpdate} className={styles.formContainer}>
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={passwordData.current_password}
                                            onChange={e => setPasswordData({ ...passwordData, current_password: e.target.value })}
                                            className={styles.textInput}
                                            required
                                        />
                                        <input
                                            type="password"
                                            placeholder="New Password (min 8 chars)"
                                            value={passwordData.new_password}
                                            onChange={e => setPasswordData({ ...passwordData, new_password: e.target.value })}
                                            className={styles.textInput}
                                            required
                                            minLength={8}
                                        />
                                        <button type="submit" className={styles.primaryButton}>
                                            Update Password
                                        </button>
                                    </form>
                                </section>

                                {/* Change Email */}
                                <section>
                                    <h3 className={styles.sectionTitle}>
                                        Change Email
                                    </h3>
                                    <form onSubmit={handleEmailUpdate} className={styles.formContainer}>
                                        <input
                                            type="email"
                                            placeholder="New Email Address"
                                            value={emailData.email}
                                            onChange={e => setEmailData({ ...emailData, email: e.target.value })}
                                            className={styles.textInput}
                                            required
                                        />
                                        <input
                                            type="password"
                                            placeholder="Current Password to Confirm"
                                            value={emailData.password}
                                            onChange={e => setEmailData({ ...emailData, password: e.target.value })}
                                            className={styles.textInput}
                                            required
                                        />
                                        <button type="submit" className={styles.primaryButton}>
                                            Update Email
                                        </button>
                                    </form>
                                </section>

                                {/* Data export (GDPR/CPRA portability) */}
                                <section>
                                    <h3 className={styles.sectionTitle}>Your Data</h3>
                                    <p className={styles.checkboxDescription}>
                                        Download a portable copy of your core account content,
                                        including goals, sessions, activities, programs, targets and notes.
                                    </p>
                                    <form onSubmit={handleExportData} className={styles.formContainer}>
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={exportPassword}
                                            onChange={e => setExportPassword(e.target.value)}
                                            className={styles.textInput}
                                            required
                                        />
                                        <button
                                            type="submit"
                                            className={styles.primaryButton}
                                            disabled={isExporting || !exportPassword}
                                        >
                                            {isExporting ? 'Preparing download...' : 'Download my data'}
                                        </button>
                                    </form>
                                </section>

                                {/* Danger Zone */}
                                <section className={styles.dangerZone}>
                                    <h3 className={styles.dangerTitle}>Danger Zone</h3>
                                    <p className={styles.dangerText}>
                                        Your account remains accessible during a 30-day grace period,
                                        then your account and content are permanently deleted. You can
                                        cancel here during the grace period. Download your data first.
                                    </p>
                                    {user?.erasure_requested_at && (
                                        <button type="button" className={styles.primaryButton} onClick={handleCancelDeletion}>
                                            Cancel scheduled deletion
                                        </button>
                                    )}
                                    {!user?.erasure_requested_at && (
                                    <form onSubmit={handleDeleteAccount} className={styles.formContainer}>
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={deleteData.password}
                                            onChange={e => setDeleteData({ ...deleteData, password: e.target.value })}
                                            className={styles.textInput}
                                            required
                                        />
                                        <div className={`${styles.dangerInputRow} ${isMobile ? styles.dangerInputRowMobile : styles.dangerInputRowDesktop}`}>
                                            <input
                                                type="text"
                                                placeholder="Type DELETE to confirm"
                                                value={deleteData.confirmation}
                                                onChange={e => setDeleteData({ ...deleteData, confirmation: e.target.value })}
                                                className={`${styles.textInput} ${styles.textInputFlex}`}
                                                required
                                            />
                                            <button
                                                type="submit"
                                                disabled={deleteData.confirmation !== 'DELETE'}
                                                className={`${styles.dangerButton} ${deleteData.confirmation === 'DELETE' ? styles.dangerButtonActive : styles.dangerButtonInactive}`}
                                            >
                                                Delete Account
                                            </button>
                                        </div>
                                    </form>
                                    )}
                                </section>
                            </div>
                        )}
                        {isMobile && (
                            <div className={styles.mobileLegalFooter}>
                                <a
                                    href="/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${styles.legalLink} ${styles.legalLinkMargin}`}
                                >
                                    Privacy Policy
                                </a>
                                <a
                                    href="/terms"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.legalLink}
                                >
                                    Terms of Service
                                </a>
                            </div>
                        )}
                    </div>
                </div>
        </Modal>
    );
};

const SettingsModal = ({ isOpen, onClose }) => {
    if (!isOpen) {
        return null;
    }

    return <SettingsModalInner onClose={onClose} />;
};

export default SettingsModal;
