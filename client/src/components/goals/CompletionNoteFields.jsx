import React from 'react';

import AttachableField from '../notes/AttachableField';
import styles from './CompletionNoteFields.module.css';

/** A goal completion note's text and evidence: shared by completing a goal and writing its note later. */
export default function CompletionNoteFields({
    id = 'goal-completion-note',
    label = 'Goal Completion Note (optional):',
    value = '',
    onChange,
    attachmentDraft = null,
    autoFocus = false,
}) {
    const input = (onPaste) => (
        <textarea
            id={id}
            className={styles.input}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onPaste={onPaste}
            placeholder="Capture what changed, what worked, or what to remember from completing this goal."
            rows={4}
            autoFocus={autoFocus}
        />
    );
    return (
        <div>
            <label className={styles.label} htmlFor={id}>{label}</label>
            {attachmentDraft ? (
                <AttachableField draft={attachmentDraft} label="Attachments for this completion note">
                    {input(attachmentDraft.handlePaste)}
                </AttachableField>
            ) : input()}
            <p className={styles.hint}>
                Paste a YouTube, Instagram, Google Drive, or direct video link on its own line to embed it as evidence.
            </p>
        </div>
    );
}
