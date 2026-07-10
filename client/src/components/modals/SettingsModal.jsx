import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useAuth } from '../../contexts/AuthContext';
import { useGoals } from '../../contexts/GoalsContext';
import { authApi, fractalApi, globalApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';
import Modal from '../atoms/Modal';
import useIsMobile from '../../hooks/useIsMobile';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import {
    MAX_ACTIVE_GOAL_WINDOW_DAYS,
    MIN_ACTIVE_GOAL_WINDOW_DAYS,
    normalizeActiveGoalWindowDays,
} from '../../hooks/useFlowTreeMetrics';
import {
    buildQuotaRows,
    getAvailableTimezones,
    toggleQuotaRootId,
} from './settingsModalUtils';
import styles from './SettingsModal.module.css';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import OnboardingSettingsPanel from '../onboarding/OnboardingSettingsPanel';

const SettingsModalInner = ({ onClose }) => {
    const {
        theme,
        toggleTheme,
        animatedIcons,
        toggleAnimatedIcons
    } = useTheme();

    const { preference, setPreference } = useTimezone();

    const [activeTab, setActiveTab] = useState('general');
    const { logout, user } = useAuth();
    const { activeRootId } = useGoals();
    const isMobile = useIsMobile();
    const onboarding = useOptionalOnboarding();
    const [availableTimezones] = useState(getAvailableTimezones);
    const [recomputeLoading, setRecomputeLoading] = useState(false);
    const [accountUsage, setAccountUsage] = useState(null);
    const [accountUsageLoading, setAccountUsageLoading] = useState(false);
    const [availableFractals, setAvailableFractals] = useState([]);
    const [fractalsLoading, setFractalsLoading] = useState(false);
    const [selectedQuotaRootIds, setSelectedQuotaRootIds] = useState([]);

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

    const handleRecomputeAll = async () => {
        if (!activeRootId) return;
        setRecomputeLoading(true);
        try {
            const res = await fractalApi.recomputeAllProgress(activeRootId);
            const failedCount = Array.isArray(res?.data?.failed) ? res.data.failed.length : 0;
            if (failedCount > 0) {
                notify.error(
                    `Progress recalculated for ${res.data.recomputed} activities, ${failedCount} failed`
                );
            } else {
                notify.success(`Progress recalculated for ${res.data.recomputed} activities`);
            }
        } catch (err) {
            notify.error(`Failed to recalculate progress: ${formatError(err)}`);
        } finally {
            setRecomputeLoading(false);
        }
    };

    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '' });
    const [emailData, setEmailData] = useState({ email: '', password: '' });
    const [deleteData, setDeleteData] = useState({ password: '', confirmation: '' });

    useEffect(() => {
        if (activeTab !== 'account') return;

        let cancelled = false;
        setAccountUsageLoading(true);
        const params = selectedQuotaRootIds.length > 0
            ? { root_ids: selectedQuotaRootIds.join(',') }
            : {};
        authApi.getAccountUsage(params)
            .then((res) => {
                if (!cancelled) {
                    setAccountUsage(res.data);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    notify.error(`Failed to load account usage: ${formatError(err)}`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setAccountUsageLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, selectedQuotaRootIds]);

    useEffect(() => {
        if (activeTab !== 'account') return;

        let cancelled = false;
        setFractalsLoading(true);
        globalApi.getAllFractals()
            .then((res) => {
                if (!cancelled) {
                    const fractals = Array.isArray(res.data) ? res.data : [];
                    setAvailableFractals(fractals);
                    const availableIds = new Set(fractals.map((fractal) => fractal.id));
                    setSelectedQuotaRootIds((current) => current.filter((rootId) => availableIds.has(rootId)));
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    notify.error(`Failed to load fractals: ${formatError(err)}`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setFractalsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    const quotaRows = useMemo(() => buildQuotaRows(accountUsage), [accountUsage]);

    const displayTier = accountUsage?.tier || user?.membership_tier || 'free';
    const displayStatus = accountUsage?.subscription_status || user?.subscription_status || 'none';
    const quotaScopeLabel = selectedQuotaRootIds.length === 0
        ? 'All fractals'
        : `${selectedQuotaRootIds.length} selected`;

    const handleQuotaRootToggle = (rootId) => {
        setSelectedQuotaRootIds((current) => toggleQuotaRootId(current, rootId));
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        try {
            await authApi.updatePassword(passwordData);
            notify.success('Password updated successfully');
            setPasswordData({ current_password: '', new_password: '' });
        } catch (err) {
            notify.error(`Failed to update password: ${formatError(err)}`);
        }
    };

    const handleEmailUpdate = async (e) => {
        e.preventDefault();
        try {
            await authApi.updateEmail(emailData);
            notify.success('Email updated successfully');
            setEmailData({ email: '', password: '' });
        } catch (err) {
            notify.error(`Failed to update email: ${formatError(err)}`);
        }
    };

    const handleDeleteAccount = async (e) => {
        e.preventDefault();
        if (deleteData.confirmation !== 'DELETE') return;

        if (window.confirm('Are you ABSOLUTELY sure? This action cannot be undone.')) {
            try {
                await authApi.deleteAccount(deleteData);
                notify.success('Account deleted.');
                logout();
                onClose();
            } catch (err) {
                notify.error(`Failed to delete account: ${formatError(err)}`);
            }
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Settings" size="lg" className={styles.modalShell}>
                <div className={`${styles.body} ${isMobile ? styles.bodyMobile : styles.bodyDesktop}`}>
                    {/* Sidebar */}
                    <div className={`${styles.sidebar} ${isMobile ? styles.sidebarMobile : styles.sidebarDesktop}`}>
                        <div className={`${styles.tabMenu} ${isMobile ? styles.tabMenuMobile : styles.tabMenuDesktop}`}>
                            <div
                                onClick={() => setActiveTab('general')}
                                className={`${styles.tab} ${isMobile ? styles.tabMobile : styles.tabDesktop} ${activeTab === 'general' ? styles.tabActive : styles.tabInactive} ${activeTab === 'general' ? (isMobile ? styles.tabActiveMobile : styles.tabActiveDesktop) : (isMobile ? styles.tabInactiveMobile : styles.tabInactiveDesktop)}`}
                            >
                                General
                            </div>
                            <div
                                onClick={() => setActiveTab('styling')}
                                className={`${styles.tab} ${isMobile ? styles.tabMobile : styles.tabDesktop} ${activeTab === 'styling' ? styles.tabActive : styles.tabInactive} ${activeTab === 'styling' ? (isMobile ? styles.tabActiveMobile : styles.tabActiveDesktop) : (isMobile ? styles.tabInactiveMobile : styles.tabInactiveDesktop)}`}
                            >
                                Goal Characteristics
                            </div>
                            <div
                                onClick={() => setActiveTab('account')}
                                className={`${styles.tab} ${isMobile ? styles.tabMobile : styles.tabDesktop} ${activeTab === 'account' ? styles.tabActive : styles.tabInactive} ${activeTab === 'account' ? (isMobile ? styles.tabActiveMobile : styles.tabActiveDesktop) : (isMobile ? styles.tabInactiveMobile : styles.tabInactiveDesktop)}`}
                            >
                                Account
                            </div>
                            {onboarding?.enabled && (
                                <div onClick={() => setActiveTab('getting-started')} className={`${styles.tab} ${isMobile ? styles.tabMobile : styles.tabDesktop} ${activeTab === 'getting-started' ? styles.tabActive : styles.tabInactive}`}>Getting Started</div>
                            )}
                        </div>

                        {/* Legal Footer in Sidebar */}
                        {!isMobile && (
                            <div className={styles.legalFooter}>
                                <a href="/privacy" className={`${styles.legalLink} ${styles.legalLinkMargin}`}>Privacy Policy</a>
                                <a href="/terms" className={styles.legalLink}>Terms of Service</a>
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

                                            <div className={styles.themeRow}>
                                                <button
                                                    onClick={handleRecomputeAll}
                                                    disabled={recomputeLoading || !progressEnabled}
                                                    className={styles.secondaryButton}
                                                >
                                                    {recomputeLoading ? 'Recalculating…' : 'Recalculate All Progress'}
                                                </button>
                                                <span className={`${styles.checkboxDescription} ${styles.descriptionSpacing}`}>
                                                    Rebuilds all progress records from scratch using current activity data
                                                </span>
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

                                {/* Danger Zone */}
                                <section className={styles.dangerZone}>
                                    <h3 className={styles.dangerTitle}>Danger Zone</h3>
                                    <p className={styles.dangerText}>
                                        Deleting your account is permanent. All your data will be wiped.
                                    </p>
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
                                </section>
                            </div>
                        )}
                        {isMobile && (
                            <div className={styles.mobileLegalFooter}>
                                <a href="/privacy" className={`${styles.legalLink} ${styles.legalLinkMargin}`}>Privacy Policy</a>
                                <a href="/terms" className={styles.legalLink}>Terms of Service</a>
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
