import React, { useState } from 'react';

import { mediaContentUrl, mediaOpenUrl, mediaThumbnailUrl } from '../../utils/api/storageApi';
import { mediaKind } from '../../utils/cloudUpload';
import { MusicIcon } from '../atoms/AppIcons';
import Button from '../atoms/Button';
import styles from './MediaAttachment.module.css';

/** False only when the browser is sure it can't decode this audio type (e.g. OGG on older Safari). */
function canPlayAudio(mimeType) {
    if (typeof document === 'undefined') return true;
    const probe = document.createElement('audio');
    return typeof probe.canPlayType !== 'function' || probe.canPlayType(mimeType) !== '';
}

function extensionOf(name) {
    const match = /\.([a-z0-9]+)$/i.exec(name || '');
    return match ? match[1].toUpperCase() : 'this';
}

export default function MediaAttachment({ asset, rootId }) {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    const available = asset.available && rootId;
    const src = available ? mediaContentUrl(rootId, asset.id) : null;
    const providerName = asset.provider === 'google_drive' ? 'Google Drive' : 'Dropbox';
    const kind = mediaKind(asset.mime_type) || 'video';
    const playable = kind !== 'audio' || canPlayAudio(asset.mime_type);
    const label = asset.alt_text || asset.name;
    let body;
    if (!available || failed) {
        body = (
            <div className={styles.unavailable} role="status">
                <p>{available ? 'This file could not load. Check your connection or reconnect storage.' : 'Storage is disconnected. Reconnect the original account to view this file.'}</p>
                {available && <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>Retry</Button>}
            </div>
        );
    } else if (!playable) {
        body = (
            <div className={styles.unavailable} role="status">
                <p>This browser can’t play {extensionOf(asset.name)} audio. Open it in {providerName} from the link below.</p>
            </div>
        );
    } else if (kind === 'image') {
        body = (
            <img key={attempt} src={src} alt={label} loading="lazy" decoding="async"
                referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        );
    } else if (kind === 'audio') {
        // Like video, nothing loads from the provider until the user presses play.
        body = <audio key={attempt} src={src} controls preload="none" aria-label={label} onError={() => setFailed(true)} />;
    } else {
        // The poster is the provider's thumbnail, so nothing of the video loads until it plays.
        body = (
            <video key={attempt} src={src} poster={mediaThumbnailUrl(rootId, asset.id)} controls preload="none"
                aria-label={label}
                onError={() => setFailed(true)} />
        );
    }
    return (
        <figure className={styles.attachment} data-kind={kind}>
            {body}
            <figcaption>
                {kind === 'audio' && <MusicIcon size={12} className={styles.kindIcon} />}
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
