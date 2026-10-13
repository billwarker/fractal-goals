import React, { useSyncExternalStore } from 'react';

import Button from '../components/atoms/Button';
import styles from './AppUpdatePrompt.module.css';
import { useOutboxStatus } from './OutboxContext';
import { applyAppUpdate, isAppUpdateReady, subscribeAppUpdate } from './serviceWorker';

/** Offers a waiting app update, but never while changes are still waiting to sync. */
export default function AppUpdatePrompt() {
    const updateReady = useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady, () => false);
    const { pendingCount, rejected } = useOutboxStatus();

    if (!updateReady || pendingCount > 0 || rejected.length > 0) return null;

    return (
        <div className={styles.prompt} role="status">
            <span>A new version of Fractal Goals is ready.</span>
            <Button size="sm" variant="primary" onClick={applyAppUpdate}>Reload</Button>
        </div>
    );
}
