import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useStorageConnections } from '../../hooks/useStorageConnections';
import { storageApi } from '../../utils/api/storageApi';
import { chooseGoogleDriveFile } from '../../utils/googleDrivePicker';
import { providerLabel } from '../../utils/storageConnectionCopy';
import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import styles from './MediaAttachment.module.css';

const errorText = (error) => error?.response?.data?.error || error?.message || 'The file could not be attached. Try again.';

/** Choose an existing file from connected cloud storage. Device uploads go through useAttachmentDraft. */
export default function CloudMediaDialog({ rootId, onAdd, onClose }) {
    const { providers, refetch, connect: openConsent, isLoading, isError } = useStorageConnections();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState(false);
    const [dropbox, setDropbox] = useState(null);
    const pickerController = useRef(null);
    const operation = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; pickerController.current?.abort(); };
    }, []);

    async function run(action) {
        const generation = ++operation.current;
        setError(''); setBusy(true);
        try { await action(); } catch (failure) { if (mounted.current && generation === operation.current) setError(errorText(failure)); }
        finally { if (mounted.current && generation === operation.current) setBusy(false); }
    }

    // The consent window opens synchronously inside the click; `run` only awaits its URL.
    const connect = (storageProvider) => { void run(() => openConsent(storageProvider)); };

    async function attach(storageProvider, file) {
        const result = await storageApi.importFile(rootId, storageProvider, file.id || file.file_id, file.resourceKey);
        onAdd({ ...result.data, asset_id: result.data.id, alt_text: '' });
    }

    function selectDrive() {
        void run(async () => {
            const credentials = (await storageApi.picker()).data;
            pickerController.current = new AbortController();
            flushSync(() => setPicking(true));
            try {
                const file = await chooseGoogleDriveFile(credentials, pickerController.current.signal);
                if (file && mounted.current) await attach('google_drive', file);
            } finally { if (mounted.current) setPicking(false); }
        });
    }

    async function listDropbox(cursor = null) {
        const result = (await storageApi.dropboxFiles(cursor)).data;
        setDropbox((previous) => ({ files: [...(cursor ? previous?.files || [] : []), ...result.files], cursor: result.cursor }));
    }

    return (
        <Modal isOpen={!picking} title="Choose from cloud storage" onClose={onClose} size="md">
            <p>Files stay in your cloud storage. Private files keep their sharing settings.</p>
            {isLoading && <p role="status">Loading storage…</p>}
            {isError && <p role="alert">Storage could not load. <Button onClick={() => refetch()}>Retry</Button></p>}
            {!isLoading && !isError && !providers.some((item) => item.configured) && (
                <p>Cloud storage isn&apos;t available yet. You can still paste shared links into your note.</p>
            )}
            <ul className={styles.files}>
                {providers.filter((item) => item.configured).map((item) => (
                    <li key={item.provider} className={styles.file}>
                        <strong>{providerLabel(item.provider)}</strong>
                        {item.connected ? <>
                            <span>{item.account_label}</span>
                            <Button disabled={busy} onClick={() => item.provider === 'google_drive' ? selectDrive() : run(() => listDropbox())}>Choose file</Button>
                        </> : <>
                            {item.status === 'reconnect_required' && <span className={styles.hint}>Access expired. Reconnect to attach files.</span>}
                            <Button disabled={busy} onClick={() => connect(item.provider)}>
                                {item.status === 'not_connected' ? 'Connect' : 'Reconnect'} {providerLabel(item.provider)}
                            </Button>
                        </>}
                    </li>
                ))}
            </ul>
            {providers.some((item) => item.configured) && (
                // A new tab keeps this note draft intact.
                <a className={styles.hint} href="/?settings=storage" target="_blank" rel="noopener noreferrer">Manage cloud storage</a>
            )}
            {dropbox && <>
                <p className={styles.hint}>Files in Apps/Fractal Goals. Add existing files to that folder in Dropbox.</p>
                <ul className={styles.files}>
                    {dropbox.files.filter((file) => /^(image|video)\//.test(file.mime_type)).map((file) => (
                        <li key={file.file_id}><Button disabled={busy} onClick={() => run(() => attach('dropbox', file))}>{file.name}</Button></li>
                    ))}
                </ul>
                {!dropbox.files.length && <p>No files in the app folder yet.</p>}
                {dropbox.cursor && <Button disabled={busy} onClick={() => run(() => listDropbox(dropbox.cursor))}>Load more files</Button>}
            </>}
            {busy && <p role="status">Working…</p>}
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <p className={styles.hint}>Media needs an internet connection.</p>
        </Modal>
    );
}
