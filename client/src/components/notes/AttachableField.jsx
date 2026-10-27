import React from 'react';

import AttachMenuButton from './AttachMenuButton';
import { AttachmentDraftList, AttachmentDraftNotice } from './NoteAttachmentsEditor';
import styles from './MediaAttachment.module.css';

/**
 * A text field with the quick-note attachment controls: a paperclip beside it (this device
 * or cloud storage), paste and drop onto it, and compact chips for what's attached.
 */
export default function AttachableField({ draft, label, disabled = false, children }) {
    return (
        <div className={styles.attachableField} {...draft.dropProps}>
            <div className={styles.attachableRow}>
                {children}
                <AttachMenuButton draft={draft} disabled={disabled} placement="down" />
            </div>
            <AttachmentDraftList draft={draft} disabled={disabled} compact label={label} />
            <AttachmentDraftNotice draft={draft} />
        </div>
    );
}
