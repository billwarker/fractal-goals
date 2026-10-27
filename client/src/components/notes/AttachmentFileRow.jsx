import React, { useId, useState } from 'react';

import { providerLabel } from '../../utils/storageConnectionCopy';
import Button from '../atoms/Button';
import styles from './MediaAttachment.module.css';

const errorText = (error) => error?.response?.data?.error || error?.message || 'Something went wrong. Try again.';
const TRASH = { google_drive: 'Google Drive trash', dropbox: 'Dropbox deleted files' };

const count = (value, one, many) => `${value} ${value === 1 ? one : many}`;

/** Where deleting the file will remove it from, by its usage counts. */
export function usageText({ notes = 0, goals = 0 }) {
    if (notes + goals <= 1) return 'It will be removed from where it’s attached.';
    const places = [notes && count(notes, 'note', 'notes'), goals && count(goals, 'goal description', 'goal descriptions')].filter(Boolean);
    return `It will be removed from ${places.join(' and ')}.`;
}

function splitName(name = '') {
    const match = name.match(/^(.*?)(\.[^.]+)?$/);
    return { base: match?.[1] || '', extension: match?.[2] || '' };
}

/**
 * A stored attachment while composing or managing a note: rename the original, remove it
 * from this note, or delete it from the user's storage (and so from every note and goal using it).
 */
export default function AttachmentFileRow({ item, draft, disabled = false }) {
    const { base, extension } = splitName(item.name);
    const [name, setName] = useState(base);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState(null);
    const storage = providerLabel(item.provider);
    const fieldId = useId();
    const renamed = name.trim() && name.trim() !== base;

    const run = async (action) => {
        setBusy(true); setError('');
        try { await action(); } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
    };
    const rename = () => run(async () => {
        const result = await draft.renameFile(item.key, `${name.trim()}${extension}`);
        setName(splitName(result.name).base);
    });
    const askDelete = () => run(async () => setConfirm(await draft.fileUsage(item.key)));
    const blocked = disabled || busy;

    return (
        <li className={styles.file}>
            <form className={styles.renameRow} onSubmit={(event) => { event.preventDefault(); if (renamed) void rename(); }}>
                <div className={styles.renameField}>
                    <label htmlFor={fieldId}>File name in {storage}</label>
                    <span className={styles.renameInput}>
                        <input id={fieldId} value={name} maxLength={200} disabled={blocked}
                            aria-describedby={extension ? `${fieldId}-extension` : undefined}
                            onChange={(event) => setName(event.target.value)} />
                        {extension && <span id={`${fieldId}-extension`} className={styles.extension}>{extension}</span>}
                    </span>
                </div>
                {renamed && <Button type="submit" size="sm" disabled={blocked}>Rename</Button>}
            </form>
            {confirm ? (
                <div className={styles.confirm} role="group" aria-label={`Confirm deleting ${item.name}`}>
                    <p>
                        Move {item.name} to the {TRASH[item.provider] || `${storage} trash`}?
                        {` ${usageText(confirm)}`}
                        {' '}You can restore it from {storage} for a limited time.
                    </p>
                    <span className={styles.controls}>
                        <Button size="sm" variant="secondary" disabled={blocked} onClick={() => setConfirm(null)}>Cancel</Button>
                        <Button size="sm" variant="danger" disabled={blocked} onClick={() => run(() => draft.deleteFile(item.key))}>
                            Delete file
                        </Button>
                    </span>
                </div>
            ) : (
                <span className={styles.controls}>
                    <Button size="sm" variant="secondary" disabled={blocked} onClick={() => draft.remove(item.key)}>Remove from note</Button>
                    <Button size="sm" variant="secondary" disabled={blocked} onClick={askDelete}>Delete from {storage}…</Button>
                </span>
            )}
            {error && <p role="alert" className={styles.error}>{error}</p>}
        </li>
    );
}
