import React from 'react';

import { useSignedInDevices } from '../../hooks/useSignedInDevices';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import LoadingState from '../common/LoadingState';
import { SettingsRow } from './SettingsSection';

const PLATFORMS = { ios: 'iPhone', macos: 'Mac' };
const lastUsed = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** The apps signed in to this account. Browsers aren't listed; signing out everywhere ends those too. */
function DeviceList() {
    const { devices, isLoading, isError, refetch, signOut, signingOutId } = useSignedInDevices();

    const handleSignOut = async (device) => {
        try {
            await signOut(device.id);
            notify.success(`Signed out of ${device.name}`);
        } catch {
            notify.error(`Couldn't sign out of ${device.name}. Please try again.`);
        }
    };

    if (isLoading || isError) {
        return <LoadingState variant="inline" error={isError} errorLabel="Couldn't load your devices." onRetry={refetch} />;
    }
    return devices.map((device) => (
        <SettingsRow
            key={device.id}
            label={device.name}
            description={`${PLATFORMS[device.platform] || device.platform} app · last used ${lastUsed(device.last_seen_at)}`}
        >
            <Button
                variant="secondary"
                size="sm"
                aria-label={`Sign out of ${device.name}`}
                isLoading={signingOutId === device.id}
                onClick={() => handleSignOut(device)}
            >
                Sign out
            </Button>
        </SettingsRow>
    ));
}

export default DeviceList;
