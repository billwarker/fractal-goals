import React from 'react';

import { useTheme } from '../../contexts/ThemeContext';
import Switch from '../atoms/Switch';
import ViewToggleTabs from '../common/ViewToggleTabs';
import SettingsSection, { SettingsRow, rowDescriptionId } from './SettingsSection';
import controls from './SettingsControls.module.css';
import styles from './AppearanceSettings.module.css';

const MODE_OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'schedule', label: 'Scheduled' },
];

const STATUS_LEAD = {
    system: 'Follows this device’s setting.',
    light: 'Always light.',
    dark: 'Always dark.',
    schedule: 'Dark between these times, by this device’s clock.',
};

/** Theme mode, the daily dark-mode schedule and icon animation; the theme follows the account across devices. */
function AppearanceSettings() {
    const { preference, setPreference, resolvedTheme, animatedIcons, toggleAnimatedIcons } = useTheme();
    const sameTimes = preference.mode === 'schedule' && preference.darkFrom === preference.lightFrom;

    return (
        <SettingsSection title="Appearance">
            <SettingsRow
                label="Theme"
                stacked
                description={sameTimes
                    ? 'Choose two different times to switch automatically. Until then the app stays dark.'
                    : `${STATUS_LEAD[preference.mode]} Showing the ${resolvedTheme} theme now.`}
            >
                <div className={styles.theme}>
                    <ViewToggleTabs
                        items={MODE_OPTIONS}
                        value={preference.mode}
                        onChange={(mode) => setPreference({ mode })}
                        ariaLabel="Theme"
                        size="compact"
                        semantics="radio"
                    />
                    {preference.mode === 'schedule' && (
                        <div className={styles.schedule}>
                            <label className={styles.time}>
                                <span>Dark from</span>
                                <input
                                    type="time"
                                    className={controls.input}
                                    value={preference.darkFrom}
                                    onChange={(event) => event.target.value && setPreference({ darkFrom: event.target.value })}
                                    required
                                />
                            </label>
                            <label className={styles.time}>
                                <span>Light from</span>
                                <input
                                    type="time"
                                    className={controls.input}
                                    value={preference.lightFrom}
                                    onChange={(event) => event.target.value && setPreference({ lightFrom: event.target.value })}
                                    required
                                />
                            </label>
                        </div>
                    )}
                </div>
            </SettingsRow>
            <SettingsRow
                label="Animated goal icons"
                description="Static icons are used when this is off."
                controlId="settings-animated-icons"
            >
                <Switch
                    id="settings-animated-icons"
                    aria-describedby={rowDescriptionId('settings-animated-icons')}
                    checked={animatedIcons}
                    onChange={toggleAnimatedIcons}
                />
            </SettingsRow>
        </SettingsSection>
    );
}

export default AppearanceSettings;
