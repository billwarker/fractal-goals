import React, { useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { usageAnalyticsAllowed } from '../../hooks/usePageViewTelemetry';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { browserPrivacySignal } from '../../utils/privacySignals';
import Switch from '../atoms/Switch';
import SettingsSection, { SettingsRow, rowDescriptionId } from './SettingsSection';

const CONTROL_ID = 'settings-usage-analytics';

/** Settings → General → Privacy: the Privacy Policy's right to object to product analytics. */
function PrivacySettings() {
    const { user, setUser } = useAuth();
    const [saving, setSaving] = useState(false);
    const browserSignal = browserPrivacySignal();
    const allowed = usageAnalyticsAllowed(user);

    const save = async (next) => {
        setSaving(true);
        try {
            const response = await authApi.updatePreferences({ preferences: { usage_analytics: next } });
            if (response?.data?.id === user?.id) setUser(response.data);
        } catch (error) {
            notify.error(`Failed to update privacy settings: ${formatError(error)}`);
        } finally {
            setSaving(false);
        }
    };

    const description = browserSignal
        ? 'Your browser asks sites not to track you (Global Privacy Control or Do Not Track), so no usage events are sent from it.'
        : 'Which pages you open and whether syncing works, never what you write. See the Privacy Policy, section 2.3.';

    return (
        <SettingsSection title="Privacy">
            <SettingsRow label="Share usage analytics" description={description} controlId={CONTROL_ID}>
                <Switch
                    id={CONTROL_ID}
                    aria-describedby={rowDescriptionId(CONTROL_ID)}
                    checked={allowed && !browserSignal}
                    disabled={saving || browserSignal || !user}
                    onChange={save}
                />
            </SettingsRow>
        </SettingsSection>
    );
}

export default PrivacySettings;
