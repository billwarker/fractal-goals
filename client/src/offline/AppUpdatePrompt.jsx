import React, { useState, useSyncExternalStore } from 'react';
import { ActionToast } from '../components/atoms/ActionToast';
import { useOutboxStatus } from './OutboxContext';
import { applyAppUpdate, isAppUpdateReady, subscribeAppUpdate } from './serviceWorker';
import styles from './AppUpdatePrompt.module.css';

/**
 * Offers a waiting app update, but not while changes are still waiting to sync.
 * Rejected changes don't block it: they persist across the reload and expire on their own.
 * Dismissing it defers the update until the app next opens.
 */
export default function AppUpdatePrompt() {
    const updateReady = useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady, () => false);
    const { pendingCount } = useOutboxStatus();
    const [dismissed, setDismissed] = useState(false);

    if (!updateReady || pendingCount > 0 || dismissed) return null;

    return (
        <div className={styles.prompt}>
            <ActionToast
                message="A new version of Fractal Goals is ready."
                actionLabel="Reload"
                onAction={applyAppUpdate}
                onDismiss={() => setDismissed(true)}
            />
        </div>
    );
}
