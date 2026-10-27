import React, { useState } from 'react';

import { mediaContentUrl, mediaOpenUrl, mediaThumbnailUrl } from '../../utils/api/storageApi';
import Button from '../atoms/Button';
import styles from './MediaAttachment.module.css';

export default function MediaAttachment({ asset, rootId }) {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    const available = asset.available && rootId;
    const src = available ? mediaContentUrl(rootId, asset.id) : null;
    const providerName = asset.provider === 'google_drive' ? 'Google Drive' : 'Dropbox';
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
                // The poster is the provider's thumbnail, so nothing of the video loads until it plays.
                <video key={attempt} src={src} poster={mediaThumbnailUrl(rootId, asset.id)} controls preload="none"
                    aria-label={asset.alt_text || asset.name}
                    onError={() => setFailed(true)} />
            )}
            <figcaption>
                {rootId ? (
                    <a className={styles.sourceLink} href={mediaOpenUrl(rootId, asset.id)} target="_blank" rel="noopener noreferrer"
                        title={`Open in ${providerName}`}>
                        {asset.name} · {providerName}<span aria-hidden="true"> ↗</span>
                    </a>
                ) : `${asset.name} · ${providerName}`}
            </figcaption>
        </figure>
    );
}
