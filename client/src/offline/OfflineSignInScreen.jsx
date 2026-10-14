import React from 'react';

import Button from '../components/atoms/Button';
import { checkConnectivity } from './connectivity';
import styles from './OfflineSignInScreen.module.css';

/** Shown instead of sign-in when there is no connection and no account on this device. */
export default function OfflineSignInScreen() {
    return (
        <main className={styles.screen} aria-labelledby="offline-sign-in-title">
            <div className={styles.card}>
                <h1 id="offline-sign-in-title" className={styles.title}>You're offline</h1>
                <p className={styles.body}>
                    Signing in needs a connection. This page will continue on its own once you're back
                    online, and anything saved on this device will sync after you sign in.
                </p>
                <Button variant="secondary" onClick={checkConnectivity}>Try again</Button>
            </div>
        </main>
    );
}
