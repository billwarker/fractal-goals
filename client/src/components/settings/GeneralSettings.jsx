import React, { useEffect, useState } from 'react';

import { useGoals } from '../../contexts/GoalsContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import {
    MAX_ACTIVE_GOAL_WINDOW_DAYS,
    MIN_ACTIVE_GOAL_WINDOW_DAYS,
    normalizeActiveGoalWindowDays,
} from '../../hooks/useFlowTreeMetrics';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Switch from '../atoms/Switch';
import { getAvailableTimezones } from '../modals/settingsModalUtils';
import AppearanceSettings from './AppearanceSettings';
import PrivacySettings from './PrivacySettings';
import SettingsSection, { SettingsRow, rowDescriptionId } from './SettingsSection';
import styles from './SettingsControls.module.css';

const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function RegionalSettings() {
    const { preference, setPreference } = useTimezone();
    const [timezones] = useState(getAvailableTimezones);
    const matchesDevice = preference === 'local';

    return (
        <SettingsSection title="Regional">
            <SettingsRow
                label="Use this device’s timezone"
                description={`Dates and times follow ${deviceTimezone()}.`}
                controlId="settings-match-device-timezone"
            >
                <Switch
                    id="settings-match-device-timezone"
                    aria-describedby={rowDescriptionId('settings-match-device-timezone')}
                    checked={matchesDevice}
                    onChange={(next) => setPreference(next ? 'local' : deviceTimezone())}
                />
            </SettingsRow>
            <SettingsRow label="Timezone" controlId="settings-timezone">
                <select
                    id="settings-timezone"
                    className={styles.select}
                    value={matchesDevice ? deviceTimezone() : preference}
                    onChange={(event) => setPreference(event.target.value)}
                    disabled={matchesDevice}
                >
                    {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
            </SettingsRow>
        </SettingsSection>
    );
}

function FractalActivitySettings({ rootId }) {
    const { progressSettings, activeGoalWindowDays, updateProgressSettings } = useRootProgressSettings(rootId);
    const progressEnabled = progressSettings?.enabled !== false;
    const [windowDraft, setWindowDraft] = useState(String(activeGoalWindowDays));

    useEffect(() => {
        setWindowDraft(String(activeGoalWindowDays));
    }, [activeGoalWindowDays]);

    const save = async (changes, failure) => {
        try {
            await updateProgressSettings({ ...(progressSettings || {}), ...changes });
        } catch (error) {
            notify.error(`${failure}: ${formatError(error)}`);
        }
    };

    const commitWindow = () => {
        const days = normalizeActiveGoalWindowDays(windowDraft);
        setWindowDraft(String(days));
        if (days !== activeGoalWindowDays) save({ active_goal_window_days: days }, 'Failed to update active goal window');
    };

    return (
        <SettingsSection title="This fractal">
            <SettingsRow
                label="Active goal window"
                description="A goal counts as active when work towards it was completed within this many days."
                controlId="settings-active-goal-window"
            >
                <span className={styles.withUnit}>
                    <input
                        id="settings-active-goal-window"
                        aria-describedby={rowDescriptionId('settings-active-goal-window')}
                        className={`${styles.input} ${styles.number}`}
                        type="number"
                        inputMode="numeric"
                        min={MIN_ACTIVE_GOAL_WINDOW_DAYS}
                        max={MAX_ACTIVE_GOAL_WINDOW_DAYS}
                        step="1"
                        value={windowDraft}
                        onChange={(event) => setWindowDraft(event.target.value)}
                        onBlur={commitWindow}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    />
                    <span className={styles.unit}>days</span>
                </span>
            </SettingsRow>
            <SettingsRow
                label="Progress comparisons"
                description="Compare each activity with its previous instance."
                controlId="settings-progress-enabled"
            >
                <Switch
                    id="settings-progress-enabled"
                    aria-describedby={rowDescriptionId('settings-progress-enabled')}
                    checked={progressEnabled}
                    onChange={(enabled) => save({ enabled }, 'Failed to update progress settings')}
                />
            </SettingsRow>
            <SettingsRow
                label="Show changes as"
                description="How the difference from the previous instance is written."
                controlId="settings-delta-format"
            >
                <select
                    id="settings-delta-format"
                    aria-describedby={rowDescriptionId('settings-delta-format')}
                    className={styles.select}
                    value={progressSettings?.delta_display_mode || 'percent'}
                    onChange={(event) => save({ delta_display_mode: event.target.value }, 'Failed to update progress settings')}
                    disabled={!progressEnabled}
                >
                    <option value="percent">Percent (▲12%)</option>
                    <option value="absolute">Absolute (+5)</option>
                </select>
            </SettingsRow>
        </SettingsSection>
    );
}

/** Settings → General: region, appearance, the current fractal's activity rules, and privacy. */
function GeneralSettings() {
    const { activeRootId } = useGoals();
    return (
        <>
            <RegionalSettings />
            <AppearanceSettings />
            {activeRootId && <FractalActivitySettings rootId={activeRootId} />}
            <PrivacySettings />
        </>
    );
}

export default GeneralSettings;
