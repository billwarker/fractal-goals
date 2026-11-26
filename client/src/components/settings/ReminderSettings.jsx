import React, { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../contexts/AuthContext';
import { queryKeys } from '../../hooks/queryKeys';
import { allowReminders } from '../../platform';
import { remindersOn, setRemindersOn, subscribeReminders } from '../../platform/reminders';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Switch from '../atoms/Switch';
import SettingsSection, { SettingsRow, rowDescriptionId } from './SettingsSection';

// The kinds the server reminds of (services/reminder_service.py), on for everyone until switched off.
const KINDS = [
    { kind: 'goal_review', label: 'Goal reviews', description: 'The morning a goal is due for review.' },
    { kind: 'program_day', label: 'Program days', description: 'The morning of each day a program asks for.' },
    { kind: 'open_session', label: 'Sessions left running', description: 'Three hours after a session began.' },
];

/** Settings → General → Reminders, in the Mac app: notifications that arrive while it's closed. */
function ReminderSettings() {
    const { user, setUser } = useAuth();
    const queryClient = useQueryClient();
    const on = useSyncExternalStore(subscribeReminders, remindersOn);
    const [saving, setSaving] = useState(false);
    const stored = user?.preferences?.reminders || {};

    const switchOn = async (next) => {
        if (next && !(await allowReminders())) {
            notify.error('Allow notifications for Fractal Goals in System Settings → Notifications, then try again.');
            return;
        }
        setRemindersOn(next);
    };

    const saveKind = async (kind, wanted) => {
        setSaving(true);
        try {
            const reminders = Object.fromEntries(KINDS.map(({ kind: each }) => [each, stored[each] !== false]));
            const response = await authApi.updatePreferences({ preferences: { reminders: { ...reminders, [kind]: wanted } } });
            if (response?.data?.id === user?.id) setUser(response.data);
            void queryClient.invalidateQueries({ queryKey: queryKeys.upcomingReminders(user?.id) });
        } catch (error) {
            notify.error(`Failed to update reminders: ${formatError(error)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsSection title="Reminders">
            <SettingsRow
                label="Remind me on this Mac"
                description="Notifications arrive even while the app is closed."
                controlId="settings-reminders"
            >
                <Switch
                    id="settings-reminders"
                    aria-describedby={rowDescriptionId('settings-reminders')}
                    checked={on}
                    onChange={switchOn}
                />
            </SettingsRow>
            {on && KINDS.map(({ kind, label, description }) => (
                <SettingsRow key={kind} label={label} description={description} controlId={`settings-reminders-${kind}`}>
                    <Switch
                        id={`settings-reminders-${kind}`}
                        aria-describedby={rowDescriptionId(`settings-reminders-${kind}`)}
                        checked={stored[kind] !== false}
                        disabled={saving || !user}
                        onChange={(wanted) => saveKind(kind, wanted)}
                    />
                </SettingsRow>
            ))}
        </SettingsSection>
    );
}

export default ReminderSettings;
