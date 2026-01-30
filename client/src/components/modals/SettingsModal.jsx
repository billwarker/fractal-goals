import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
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
                        padding: '16px 0'
                    }}>
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
                        {/* Placeholder for future settings */}
                        <div style={{ padding: '12px 24px', color: 'var(--color-text-muted)', cursor: 'not-allowed', opacity: 0.5 }}>
                            Account (Coming Soon)
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
