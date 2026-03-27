import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useAuth } from '../../contexts/AuthContext';
import { useGoals } from '../../contexts/GoalsContext';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './SettingsModal.module.css';

function getAvailableTimezones() {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch (error) {
        console.error('Timezone API not supported', error);
        return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
    }
}

const SettingsModalInner = ({ onClose }) => {
    const {
        theme,
        toggleTheme,
        animatedIcons,
        toggleAnimatedIcons
    } = useTheme();

    const { preference, setPreference } = useTimezone();

    const [activeTab, setActiveTab] = useState('general');
    const { logout } = useAuth();
    const { activeRootId } = useGoals();
    const isMobile = useIsMobile();
    const [availableTimezones] = useState(getAvailableTimezones);

    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '' });
    const [emailData, setEmailData] = useState({ email: '', password: '' });
    const [deleteData, setDeleteData] = useState({ password: '', confirmation: '' });

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
        <div className={`${styles.overlay} ${isMobile ? styles.overlayMobile : styles.overlayDesktop}`}>
            <div className={`${styles.modal} ${isMobile ? styles.modalMobile : styles.modalDesktop}`}>
                {/* Header */}
                <div className={`${styles.header} ${isMobile ? styles.headerMobile : styles.headerDesktop}`}>
                    <h2 className={`${styles.title} ${isMobile ? styles.titleMobile : styles.titleDesktop}`}>Settings</h2>
                    <button
                        onClick={onClose}
                        className={`${styles.closeButton} ${isMobile ? styles.closeButtonMobile : styles.closeButtonDesktop}`}
                        aria-label="Close settings"
                    >
                        &times;
                    </button>
                </div>

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

                        {activeTab === 'account' && (
                            <div className={styles.tabContent}>
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
            </div>
        </div>
    );
};

const SettingsModal = ({ isOpen, onClose }) => {
    if (!isOpen) {
        return null;
    }

    return <SettingsModalInner onClose={onClose} />;
};

export default SettingsModal;
