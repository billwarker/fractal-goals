import React from 'react';

import Button from '../components/atoms/Button';
import { openExternal } from './index';
import styles from '../offline/OfflineSignInScreen.module.css';

/** Shown when an installed app is too old for the server. Unsent changes stay on the device. */
export default function UpdateRequiredScreen() {
    return (
        <main className={styles.screen} aria-labelledby="update-required-title">
            <div className={styles.card}>
                <h1 id="update-required-title" className={styles.title}>Update Fractal Goals</h1>
                <p className={styles.body}>
                    This version is too old to connect. Changes you haven't synced are safe on this device and
                    sync once you update. Until then you can use Fractal Goals in your browser.
                </p>
                <Button variant="secondary" onClick={() => openExternal('/')}>Open in browser</Button>
            </div>
        </main>
    );
}
