import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import { useTimezone } from '../../contexts/TimezoneContext';
import { useAuth } from '../../contexts/AuthContext';
import { useGoals } from '../../contexts/GoalsContext';
import { authApi } from '../../utils/api';
import toast from 'react-hot-toast';
import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';
import useIsMobile from '../../hooks/useIsMobile';

const SettingsModal = ({ isOpen, onClose }) => {
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
    const [availableTimezones, setAvailableTimezones] = useState([]);

    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '' });
    const [emailData, setEmailData] = useState({ email: '', password: '' });
    const [deleteData, setDeleteData] = useState({ password: '', confirmation: '' });

    useEffect(() => {
        if (isOpen) {
            try {
                setAvailableTimezones(Intl.supportedValuesOf('timeZone'));
            } catch (e) {
                console.error("Timezone API not supported", e);
                setAvailableTimezones(['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']);
            }
        }
    }, [isOpen]);

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        try {
            await authApi.updatePassword(passwordData);
            toast.success('Password updated successfully');
            setPasswordData({ current_password: '', new_password: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update password');
        }
    };

    const handleEmailUpdate = async (e) => {
        e.preventDefault();
        try {
            await authApi.updateEmail(emailData);
            toast.success('Email updated successfully');
            setEmailData({ email: '', password: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update email');
        }
    };

    const handleDeleteAccount = async (e) => {
        e.preventDefault();
        if (deleteData.confirmation !== 'DELETE') return;

        if (window.confirm('Are you ABSOLUTELY sure? This action cannot be undone.')) {
            try {
                await authApi.deleteAccount(deleteData);
                toast.success('Account deleted.');
                logout();
                onClose();
            } catch (err) {
                toast.error(err.response?.data?.error || 'Failed to delete account');
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--color-overlay)',
            zIndex: 2000,
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)',
            padding: isMobile ? '0' : '16px'
        }}>
            <div style={{
                width: isMobile ? '100vw' : 'min(800px, calc(100vw - 32px))',
                height: isMobile ? 'min(88vh, 760px)' : 'min(600px, calc(100vh - 32px))',
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-card)',
                borderRadius: isMobile ? '16px 16px 0 0' : '8px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: isMobile ? '14px 16px' : '16px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--color-bg-header)'
                }}>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '18px', color: 'var(--color-text-primary)' }}>Settings</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: isMobile ? '34px' : '24px',
                            cursor: 'pointer',
                            lineHeight: 1,
                            padding: 0,
                            minWidth: isMobile ? '40px' : 'auto',
                            minHeight: isMobile ? '40px' : 'auto'
                        }}
                    >
                        &times;
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
                    {/* Sidebar */}
                    <div style={{
                        width: isMobile ? '100%' : '200px',
                        borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
                        borderBottom: isMobile ? '1px solid var(--color-border)' : 'none',
                        backgroundColor: 'var(--color-bg-sidebar)',
                        padding: isMobile ? '8px 0' : '16px 0',
                        display: 'flex',
                        flexDirection: isMobile ? 'row' : 'column',
                        justifyContent: 'space-between',
                        overflowX: isMobile ? 'auto' : 'visible'
                    }}>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', minWidth: isMobile ? 'max-content' : 'auto' }}>
                            <div
                                onClick={() => setActiveTab('general')}
                                style={{
                                    padding: isMobile ? '10px 14px' : '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'general' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'general' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'general' ? 'bold' : 'normal',
                                    borderLeft: isMobile ? 'none' : (activeTab === 'general' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'),
                                    borderBottom: isMobile ? (activeTab === 'general' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent') : 'none',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                General
                            </div>
                            <div
                                onClick={() => setActiveTab('styling')}
                                style={{
                                    padding: isMobile ? '10px 14px' : '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'styling' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'styling' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'styling' ? 'bold' : 'normal',
                                    borderLeft: isMobile ? 'none' : (activeTab === 'styling' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'),
                                    borderBottom: isMobile ? (activeTab === 'styling' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent') : 'none',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Goal Characteristics
                            </div>
                            <div
                                onClick={() => setActiveTab('account')}
                                style={{
                                    padding: isMobile ? '10px 14px' : '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'account' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'account' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'account' ? 'bold' : 'normal',
                                    borderLeft: isMobile ? 'none' : (activeTab === 'account' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'),
                                    borderBottom: isMobile ? (activeTab === 'account' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent') : 'none',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Account
                            </div>
                        </div>

                        {/* Legal Footer in Sidebar */}
                        {!isMobile && (
                            <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)' }}>
                                <a href="/privacy" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px', textDecoration: 'none' }}>Privacy Policy</a>
                                <a href="/terms" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', textDecoration: 'none' }}>Terms of Service</a>
                            </div>
                        )}
                    </div>

                    {/* Content Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', backgroundColor: 'var(--color-bg-card)' }}>
                        {activeTab === 'general' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Regional
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <input
                                                type="checkbox"
                                                id="match-system-tz"
                                                checked={preference === 'local'}
                                                onChange={(e) => {
                                                    if (e.target.checked) setPreference('local');
                                                    else setPreference(Intl.DateTimeFormat().resolvedOptions().timeZone);
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                            <label htmlFor="match-system-tz" style={{ color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                                Match System Timezone
                                                <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                    Always use the timezone from your device settings ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                                                </span>
                                            </label>
                                        </div>

                                        <div style={{ opacity: preference === 'local' ? 0.5 : 1, pointerEvents: preference === 'local' ? 'none' : 'auto' }}>
                                            <select
                                                id="tz-select"
                                                value={preference === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : preference}
                                                onChange={(e) => setPreference(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--color-border-input)',
                                                    backgroundColor: 'var(--color-bg-input)',
                                                    color: 'var(--color-text-primary)'
                                                }}
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
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Interface Theme
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '16px', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                                            Current Mode: <strong>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</strong>
                                        </div>
                                        <button
                                            onClick={toggleTheme}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: 'var(--color-bg-input)',
                                                border: '1px solid var(--color-border-btn)',
                                                borderRadius: 'var(--border-radius-sm)',
                                                color: 'var(--color-text-primary)',
                                                cursor: 'pointer',
                                                fontSize: '14px'
                                            }}
                                        >
                                            Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
                                        </button>
                                    </div>
                                </section>

                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Animated Icons
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <input
                                            type="checkbox"
                                            id="animated-icons-toggle"
                                            checked={animatedIcons}
                                            onChange={toggleAnimatedIcons}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="animated-icons-toggle" style={{ color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                            Enable fractal animations on goal icons
                                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                When disabled, static icons will be used instead
                                            </span>
                                        </label>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'styling' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Goal Characteristics {activeRootId ? '(This Fractal)' : '(Global)'}
                                    </h3>
                                    <GoalCharacteristicsSettings scope={activeRootId || 'default'} />
                                </section>
                            </div>
                        )}

                        {activeTab === 'account' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                {/* Change Password */}
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Change Password
                                    </h3>
                                    <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={passwordData.current_password}
                                            onChange={e => setPasswordData({ ...passwordData, current_password: e.target.value })}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                            required
                                        />
                                        <input
                                            type="password"
                                            placeholder="New Password (min 8 chars)"
                                            value={passwordData.new_password}
                                            onChange={e => setPasswordData({ ...passwordData, new_password: e.target.value })}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                            required
                                            minLength={8}
                                        />
                                        <button type="submit" style={{ padding: '8px 16px', background: 'var(--color-brand-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                            Update Password
                                        </button>
                                    </form>
                                </section>

                                {/* Change Email */}
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Change Email
                                    </h3>
                                    <form onSubmit={handleEmailUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                                        <input
                                            type="email"
                                            placeholder="New Email Address"
                                            value={emailData.email}
                                            onChange={e => setEmailData({ ...emailData, email: e.target.value })}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                            required
                                        />
                                        <input
                                            type="password"
                                            placeholder="Current Password to Confirm"
                                            value={emailData.password}
                                            onChange={e => setEmailData({ ...emailData, password: e.target.value })}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                            required
                                        />
                                        <button type="submit" style={{ padding: '8px 16px', background: 'var(--color-brand-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                            Update Email
                                        </button>
                                    </form>
                                </section>

                                {/* Danger Zone */}
                                <section style={{ border: '1px solid var(--color-brand-danger)', padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    <h3 style={{ marginTop: 0, marginBottom: '8px', color: 'var(--color-brand-danger)' }}>Danger Zone</h3>
                                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                                        Deleting your account is permanent. All your data will be wiped.
                                    </p>
                                    <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={deleteData.password}
                                            onChange={e => setDeleteData({ ...deleteData, password: e.target.value })}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                            required
                                        />
                                        <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
                                            <input
                                                type="text"
                                                placeholder="Type DELETE to confirm"
                                                value={deleteData.confirmation}
                                                onChange={e => setDeleteData({ ...deleteData, confirmation: e.target.value })}
                                                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-input)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                                required
                                            />
                                            <button
                                                type="submit"
                                                disabled={deleteData.confirmation !== 'DELETE'}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: deleteData.confirmation === 'DELETE' ? 'var(--color-brand-danger)' : 'var(--color-text-muted)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: deleteData.confirmation === 'DELETE' ? 'pointer' : 'not-allowed'
                                                }}>
                                                Delete Account
                                            </button>
                                        </div>
                                    </form>
                                </section>
                            </div>
                        )}
                        {isMobile && (
                            <div style={{ paddingTop: '12px', marginTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                                <a href="/privacy" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px', textDecoration: 'none' }}>Privacy Policy</a>
                                <a href="/terms" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', textDecoration: 'none' }}>Terms of Service</a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
