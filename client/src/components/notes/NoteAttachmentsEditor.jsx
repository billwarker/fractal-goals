import React, { forwardRef, lazy, Suspense, useRef, useState } from 'react';

import { canonicalMediaType, mediaKind, UPLOAD_ACCEPT } from '../../utils/cloudUpload';
import { ImageIcon, MusicIcon, VideoIcon } from '../atoms/AppIcons';
import Button from '../atoms/Button';
import AttachmentFileRow from './AttachmentFileRow';
import styles from './MediaAttachment.module.css';

const CloudMediaDialog = lazy(() => import('./CloudMediaDialog'));

/** Hidden multi-file input that queues the chosen files on a draft. */
export const AttachmentFileInput = forwardRef(function AttachmentFileInput({ draft }, ref) {
    return (
        <input ref={ref} type="file" accept={UPLOAD_ACCEPT} multiple hidden aria-hidden="true" tabIndex={-1}
            onChange={(event) => { draft.addFiles(event.target.files); event.target.value = ''; }} />
    );
});

export function CloudPicker({ draft, onClose }) {
    return (
        <Suspense fallback={null}>
            <CloudMediaDialog rootId={draft.rootId} onClose={onClose} onAdd={(asset) => { draft.addAsset(asset); onClose(); }} />
        </Suspense>
    );
}

const KIND_ICONS = { image: ImageIcon, video: VideoIcon, audio: MusicIcon };

/** Picture, video or audio glyph, so a chip reads as a recording or a photo at a glance. */
function MediaKindIcon({ item }) {
    const Icon = KIND_ICONS[mediaKind(canonicalMediaType(item.mime_type || item.file?.type, item.name))];
    return Icon ? <Icon size={14} className={styles.kindIcon} /> : null;
}

/** Uploading, failed and finished attachments. `compact` (quick bars) only offers removal. */
export function AttachmentDraftList({ draft, disabled = false, compact = false, label = 'Attachments for this note' }) {
    if (!draft.items.length) return null;
    return (
        <ul className={compact ? styles.compactFiles : styles.files} aria-label={label}>
            {draft.items.map((item) => (!compact && item.status === 'ready' ? (
                <AttachmentFileRow key={item.key} item={item} draft={draft} disabled={disabled} />
            ) : (
                <li key={item.key} className={compact ? styles.compactFile : styles.file} data-status={item.status}>
                    <span className={styles.fileName}><MediaKindIcon item={item} />{item.name || 'Attached file'}</span>
                    {item.status === 'uploading' && (
                        <progress aria-label={`Uploading ${item.name}`} value={item.progress || 0} max={1} />
                    )}
                    {item.status === 'failed' && <span role="alert" className={styles.error}>{item.error}</span>}
                    <span className={styles.controls}>
                        {item.status === 'failed' && (
                            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => draft.retry(item.key)}>Retry</Button>
                        )}
                        <Button size="sm" variant="secondary" disabled={disabled} aria-label={`Remove ${item.name || 'attachment'}`}
                            onClick={() => draft.remove(item.key)}>{compact ? '×' : 'Remove'}</Button>
                    </span>
                </li>
            )))}
        </ul>
    );
}

export function AttachmentDraftNotice({ draft }) {
    if (!draft.notice) return null;
    return (
        <p role="alert" className={styles.hint}>
            {draft.notice}
            {draft.notice.includes('Settings') && <> <a href="/?settings=storage" target="_blank" rel="noopener noreferrer">Open settings</a></>}
        </p>
    );
}

export default function NoteAttachmentsEditor({ draft, disabled = false }) {
    const [choosing, setChoosing] = useState(false);
    const fileInput = useRef(null);
    const blocked = disabled || !draft.canAdd || !draft.rootId;
    return (
        <div>
            <AttachmentDraftList draft={draft} disabled={disabled} />
            <AttachmentDraftNotice draft={draft} />
            <div className={styles.controls}>
                <Button variant="secondary" disabled={blocked} onClick={() => fileInput.current?.click()}>Upload from device</Button>
                <Button variant="secondary" disabled={blocked} onClick={() => setChoosing(true)}>Choose from cloud storage</Button>
                <span className={styles.hint}>
                    You can also paste or drop files.{draft.destinationLabel ? ` They’re saved to your ${draft.destinationLabel}.` : ''}
                </span>
            </div>
            <AttachmentFileInput ref={fileInput} draft={draft} />
            {choosing && <CloudPicker draft={draft} onClose={() => setChoosing(false)} />}
        </div>
    );
}
