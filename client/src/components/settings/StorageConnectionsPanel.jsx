import React, { useState } from 'react';

import { useStorageConnections } from '../../hooks/useStorageConnections';
import { STORAGE_PROVIDERS, providerLabel } from '../../utils/storageConnectionCopy';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import styles from './StorageConnectionsPanel.module.css';

const STATUS_BADGES = {
    active: ['Connected', 'success'],
    reconnect_required: ['Needs reconnecting', 'warning'],
    disconnected: ['Disconnected', 'neutral'],
    not_connected: ['Not connected', 'neutral'],
    unavailable: ['Unavailable', 'neutral'],
};
const errorText = (error) => error?.response?.data?.error || error?.message || 'Something went wrong. Try again.';
const attachmentsText = (count) => `${count} attachment${count === 1 ? '' : 's'}`;

function formatBytes(bytes) {
    if (!bytes) return null;
    const mib = bytes / (1024 * 1024);
    return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${Math.round(mib)} MB`;
}

function ProviderCard({ item, busy, onConnect, onDisconnect }) {
    const [confirming, setConfirming] = useState(false);
    const label = providerLabel(item.provider);
    const copy = STORAGE_PROVIDERS[item.provider] || {};
    const count = item.attachment_count || 0;
    const titleId = `storage-${item.provider}-title`;
    const [statusLabel, statusVariant] = STATUS_BADGES[item.status] || [item.status, 'neutral'];
    const connectedOn = item.connected_at ? new Date(item.connected_at).toLocaleDateString() : null;

    return (
        <article className={styles.card} aria-labelledby={titleId} data-status={item.status}>
            <header className={styles.cardHeader}>
                <h4 id={titleId}>{label}</h4>
                <Badge variant={statusVariant} size="sm">{statusLabel}</Badge>
            </header>

            {item.status === 'unavailable' && (
                <p className={styles.muted}>{label} isn’t available on this deployment yet.</p>
            )}

            {item.status === 'active' && (
                <>
                    <dl className={styles.details}>
                        <div><dt>Account</dt><dd>{item.account_label}</dd></div>
                        {connectedOn && <div><dt>Connected since</dt><dd>{connectedOn}</dd></div>}
                        <div><dt>Used by</dt><dd>{attachmentsText(count)}</dd></div>
                    </dl>
                    <p className={styles.muted}>{copy.destination}</p>
                    {confirming ? (
                        <div className={styles.confirm} role="group" aria-label={`Confirm disconnecting ${label}`}>
                            <p>
                                {count > 0 ? `${attachmentsText(count)} will stop displaying until you reconnect. ` : ''}
                                Your files stay in {label}, and Fractal Goals’ access is revoked.
                            </p>
                            <div className={styles.actions}>
                                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
                                <Button variant="danger" isLoading={busy} onClick={() => onDisconnect(item.provider)}>Disconnect</Button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.actions}>
                            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>Disconnect {label}</Button>
                        </div>
                    )}
                </>
            )}

            {item.status === 'reconnect_required' && (
                <p className={styles.warning}>
                    Access to {item.account_label || label} expired or was removed in {label}.
                    {count > 0 ? ` ${attachmentsText(count)} can’t display until you reconnect.` : ''}
                </p>
            )}

            {item.status === 'disconnected' && count > 0 && (
                <p className={styles.muted}>
                    {attachmentsText(count)} from {item.account_label || label} can’t display until you reconnect that account.
                </p>
            )}

            {['not_connected', 'disconnected', 'reconnect_required'].includes(item.status) && (
                <>
                    <p className={styles.muted}>{copy.scope}</p>
                    <div className={styles.actions}>
                        <Button disabled={busy} onClick={() => onConnect(item.provider)}>
                            {item.status === 'not_connected' ? `Connect ${label}` : `Reconnect ${label}`}
                        </Button>
                    </div>
                </>
            )}
        </article>
    );
}

export default function StorageConnectionsPanel() {
    const {
        providers, limits, isLoading, isError, refetch, connect, disconnect, isDisconnecting, lastResult, clearLastResult,
        uploadDestination, setUploadDestination, isSavingDestination,
    } = useStorageConnections();
    const connected = providers.filter((item) => item.connected);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const status = lastResult || (notice ? { ok: true, message: notice } : null);

    const reset = () => { setError(''); setNotice(''); clearLastResult(); };
    const handleConnect = (provider) => {
        reset();
        connect(provider).catch((failure) => setError(errorText(failure)));
    };
    const handleDisconnect = async (provider) => {
        reset();
        try {
            await disconnect(provider);
            setNotice(`${providerLabel(provider)} disconnected.`);
        } catch (failure) {
            setError(errorText(failure));
        }
    };

    const handleDestination = async (provider) => {
        reset();
        try {
            await setUploadDestination(provider);
            setNotice(`New uploads will be saved to ${providerLabel(provider)}.`);
        } catch (failure) {
            setError(errorText(failure));
        }
    };

    return (
        <div className={styles.panel}>
            <section className={styles.section} aria-labelledby="storage-settings-title">
                <h3 id="storage-settings-title">Cloud storage</h3>
                <p>Attach pictures, video and audio to notes from your own cloud storage. Originals stay in your account; Fractal Goals keeps only a reference to each file.</p>
            </section>

            {status && <p className={status.ok ? styles.success : styles.error} role={status.ok ? 'status' : 'alert'}>{status.message}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}

            <section className={styles.section} aria-label="Storage accounts">
                {isLoading && <p className={styles.muted} role="status">Loading storage accounts…</p>}
                {isError && (
                    <p className={styles.error} role="alert">
                        Storage accounts couldn’t load. <Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>
                    </p>
                )}
                {!isLoading && !isError && (
                    <div className={styles.cards}>
                        {providers.map((item) => (
                            <ProviderCard key={item.provider} item={item} busy={isDisconnecting}
                                onConnect={handleConnect} onDisconnect={handleDisconnect} />
                        ))}
                    </div>
                )}
                {!isLoading && !isError && providers.length > 0 && providers.every((item) => item.status === 'unavailable') && (
                    <p className={styles.muted}>You can still paste shared links to pictures and video into any note.</p>
                )}
            </section>

            {connected.length > 1 && (
                <section className={styles.section} aria-labelledby="storage-destination-title">
                    <h3 id="storage-destination-title">Save new uploads to</h3>
                    <p>Files you paste, drop or upload from this device go to this account.</p>
                    <div className={styles.destinations} role="radiogroup" aria-labelledby="storage-destination-title">
                        {connected.map((item) => (
                            <label key={item.provider} className={styles.destination}>
                                <input type="radio" name="storage-upload-destination" value={item.provider}
                                    checked={uploadDestination === item.provider} disabled={isSavingDestination}
                                    onChange={() => handleDestination(item.provider)} />
                                <span>
                                    <strong>{providerLabel(item.provider)}</strong>
                                    <span className={styles.muted}>{item.account_label}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </section>
            )}

            <section className={styles.section} aria-labelledby="storage-limits-title">
                <h3 id="storage-limits-title">Limits</h3>
                <ul className={styles.limits}>
                    {limits?.max_file_bytes && <li>Up to {formatBytes(limits.max_file_bytes)} per file</li>}
                    {limits?.max_attachments && <li>Up to {limits.max_attachments} attachments per note</li>}
                    <li>JPEG, PNG, WebP and GIF pictures; MP4 and WebM video; MP3, M4A, WAV, FLAC and OGG audio</li>
                    <li>Attachments need an internet connection; note text still works offline</li>
                </ul>
                <p className={styles.muted}>
                    Disconnecting or deleting a note never deletes files from your storage.{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                </p>
            </section>
        </div>
    );
}
