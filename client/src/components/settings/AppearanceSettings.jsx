import React from 'react';

import { useTheme } from '../../contexts/ThemeContext';
import ViewToggleTabs from '../common/ViewToggleTabs';
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

/** Theme mode and the daily dark-mode schedule; the choice follows the account across devices. */
function AppearanceSettings({ titleClassName }) {
    const { preference, setPreference, resolvedTheme } = useTheme();
    const sameTimes = preference.mode === 'schedule' && preference.darkFrom === preference.lightFrom;

    return (
        <section aria-labelledby="appearance-settings-title">
            <h3 id="appearance-settings-title" className={titleClassName}>Theme</h3>
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
                            value={preference.darkFrom}
                            onChange={(event) => event.target.value && setPreference({ darkFrom: event.target.value })}
                            required
                        />
                    </label>
                    <label className={styles.time}>
                        <span>Light from</span>
                        <input
                            type="time"
                            value={preference.lightFrom}
                            onChange={(event) => event.target.value && setPreference({ lightFrom: event.target.value })}
                            required
                        />
                    </label>
                </div>
            )}

            <p className={styles.status} role="status">
                {sameTimes
                    ? 'Choose two different times to switch automatically. Until then the app stays dark.'
                    : `${STATUS_LEAD[preference.mode]} Showing the ${resolvedTheme} theme now.`}
            </p>
        </section>
    );
}

export default AppearanceSettings;
