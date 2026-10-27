import React, { useSyncExternalStore } from 'react';
import Button from '../components/atoms/Button';
import { useOutboxStatus } from './OutboxContext';
import { applyAppUpdate, isAppUpdateReady, subscribeAppUpdate } from './serviceWorker';
import styles from './AppUpdatePrompt.module.css';

/**
 * Offers a waiting app update, but not while changes are still waiting to sync.
 * Rejected changes don't block it: they persist across the reload and expire on their own.
 */
export default function AppUpdatePrompt() {
    const updateReady = useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady, () => false);
    const { pendingCount } = useOutboxStatus();

    if (!updateReady || pendingCount > 0) return null;

    return (
        <div className={styles.prompt} role="status">
            <span>A new version of Fractal Goals is ready.</span>
            <Button size="sm" variant="primary" onClick={applyAppUpdate}>Reload</Button>
        </div>
    );
}
