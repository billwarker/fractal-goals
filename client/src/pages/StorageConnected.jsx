import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { STORAGE_CHANNEL, connectionResult, providerLabel } from '../utils/storageConnectionCopy';
import styles from './StorageConnected.module.css';

/**
 * Landing page for the provider OAuth return. It tells any open Fractal Goals tab the
 * outcome, then closes itself; if the window stays open it explains what happened.
 */
export default function StorageConnected() {
    const { search } = useLocation();
    const { provider, outcome } = useMemo(() => {
        const params = new URLSearchParams(search);
        const name = params.get('provider');
        return { provider: name, outcome: connectionResult(name, params.get('result')) };
    }, [search]);

    useEffect(() => {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel(STORAGE_CHANNEL);
            channel.postMessage({ type: 'storage-connection', provider, result: outcome.result });
            channel.close();
        }
        window.close();
    }, [provider, outcome.result]);

    return (
        <main className={styles.page}>
            <section className={styles.card} aria-labelledby="storage-connected-title">
                <h1 id="storage-connected-title">{outcome.ok ? `${providerLabel(provider)} connected` : 'Connection not completed'}</h1>
                <p role={outcome.ok ? 'status' : 'alert'}>{outcome.message}</p>
                <p className={styles.hint}>You can close this window and return to Fractal Goals.</p>
                <a className={styles.link} href="/?settings=storage">Open cloud storage settings</a>
            </section>
        </main>
    );
}
