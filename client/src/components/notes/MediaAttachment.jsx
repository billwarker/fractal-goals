import React, { useState } from 'react';

import { mediaContentUrl } from '../../utils/api/storageApi';
import Button from '../atoms/Button';
import styles from './MediaAttachment.module.css';

export default function MediaAttachment({ asset, rootId }) {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    const available = asset.available && rootId;
    const src = available ? mediaContentUrl(rootId, asset.id) : null;
    return (
        <figure className={styles.attachment}>
            {!available || failed ? (
                <div className={styles.unavailable} role="status">
                    <p>{available ? 'This file could not load. Check your connection or reconnect storage.' : 'Storage is disconnected. Reconnect the original account to view this file.'}</p>
                    {available && <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>Retry</Button>}
                </div>
            ) : asset.mime_type.startsWith('image/') ? (
                <img key={attempt} src={src} alt={asset.alt_text || asset.name} loading="lazy" decoding="async"
                    referrerPolicy="no-referrer" onError={() => setFailed(true)} />
            ) : (
                <video key={attempt} src={src} controls preload="none" aria-label={asset.alt_text || asset.name}
                    onError={() => setFailed(true)} />
            )}
            <figcaption>{asset.name} · {asset.provider === 'google_drive' ? 'Google Drive' : 'Dropbox'}</figcaption>
        </figure>
    );
}
