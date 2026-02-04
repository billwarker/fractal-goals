import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../utils/api';
import toast from 'react-hot-toast';
import { getGoalColorName } from '../../utils/goalColors'; // Still useful for display names

const SettingsModal = ({ isOpen, onClose }) => {
    const {
        theme,
        toggleTheme,
        goalColors,
        setGoalColor,
        resetGoalColors
    } = useTheme();

    const { preference, setPreference } = useTimezone();

    const [activeTab, setActiveTab] = useState('general');
    const [availableTimezones, setAvailableTimezones] = useState([]);

    const { logout } = useAuth();
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

    // Helper to format goal types for display (e.g. "UltimateGoal" -> "Ultimate Goal")
    const formatGoalType = (type) => {
        return type.replace(/([A-Z])/g, ' $1').trim();
    };

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
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)'
        }}>
            <div style={{
                width: '800px',
                height: '600px',
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-card)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--color-bg-header)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--color-text-primary)' }}>Settings</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: '24px',
                            cursor: 'pointer',
                            lineHeight: 1
                        }}
                    >
                        &times;
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Sidebar */}
                    <div style={{
                        width: '200px',
                        borderRight: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-sidebar)',
                        padding: '16px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div
                                onClick={() => setActiveTab('general')}
                                style={{
                                    padding: '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'general' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'general' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'general' ? 'bold' : 'normal',
                                    borderLeft: activeTab === 'general' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'
                                }}
                            >
                                General
                            </div>
                            <div
                                onClick={() => setActiveTab('themes')}
                                style={{
                                    padding: '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'themes' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'themes' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'themes' ? 'bold' : 'normal',
                                    borderLeft: activeTab === 'themes' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'
                                }}
                            >
                                Themes
                            </div>
                            <div
                                onClick={() => setActiveTab('account')}
                                style={{
                                    padding: '12px 24px',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'account' ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: activeTab === 'account' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: activeTab === 'account' ? 'bold' : 'normal',
                                    borderLeft: activeTab === 'account' ? '3px solid var(--color-brand-primary, #3b82f6)' : '3px solid transparent'
                                }}
                            >
                                Account
                            </div>
                        </div>

                        {/* Legal Footer in Sidebar */}
                        <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)' }}>
                            <a href="/privacy" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px', textDecoration: 'none' }}>Privacy Policy</a>
                            <a href="/terms" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', textDecoration: 'none' }}>Terms of Service</a>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: 'var(--color-bg-card)' }}>
                        {activeTab === 'general' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Timezone
                                    </h3>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <input
                                                type="checkbox"
                                                id="match-system-tz"
                                                checked={preference === 'local'}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setPreference('local');
                                                    } else {
                                                        // When unchecking, set to current system timezone explicitly
                                                        setPreference(Intl.DateTimeFormat().resolvedOptions().timeZone);
                                                    }
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
                                            <label htmlFor="tz-select" style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                                                Manual Selection
                                            </label>
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
                            </div>
                        )}

                        {activeTab === 'themes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                                {/* Interface Theme Section */}
                                <section>
                                    <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        Interface Theme
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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

                                {/* Goal Colors Section */}
                                <section>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                        <h3 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Goal Colors</h3>
                                        <button
                                            onClick={() => {
                                                if (window.confirm('Are you sure you want to reset all goal colors to defaults?')) {
                                                    resetGoalColors();
                                                }
                                            }}
                                            style={{
                                                fontSize: '12px',
                                                background: 'transparent',
                                                border: '1px solid var(--color-brand-danger, #ef4444)',
                                                color: 'var(--color-brand-danger, #ef4444)',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Reset to Defaults
                                        </button>
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                        gap: '20px'
                                    }}>
                                        {Object.entries(goalColors).map(([type, colors]) => (
                                            <div
                                                key={type}
                                                style={{
                                                    padding: '16px',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: '8px',
                                                    backgroundColor: 'var(--color-bg-card-alt)'
                                                }}
                                            >
                                                <div style={{
                                                    marginBottom: '12px',
                                                    fontWeight: 'bold',
                                                    color: 'var(--color-text-primary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    {/* Color Preview Dot */}
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        backgroundColor: colors.primary,
                                                        border: '1px solid rgba(0,0,0,0.2)'
                                                    }}></div>
                                                    {formatGoalType(type)}
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                    {/* Primary Color Input */}
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Primary</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="color"
                                                                value={colors.primary}
                                                                onChange={(e) => setGoalColor(type, 'primary', e.target.value)}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    height: '32px',
                                                                    width: '100%',
                                                                    padding: 0,
                                                                    border: '1px solid var(--color-border)',
                                                                    borderRadius: '4px'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Secondary Color Input */}
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Secondary</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="color"
                                                                value={colors.secondary}
                                                                onChange={(e) => setGoalColor(type, 'secondary', e.target.value)}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    height: '32px',
                                                                    width: '100%',
                                                                    padding: 0,
                                                                    border: '1px solid var(--color-border)',
                                                                    borderRadius: '4px'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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
                                        <div style={{ display: 'flex', gap: '8px' }}>
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
