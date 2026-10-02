import React from 'react';

import styles from './PrescriptionEditor.module.css';

/**
 * The note for whatever is scoped in a planned item: the item itself, or its selected set
 * or round. Plans hold one note per scope, so this edits that note in place; Enter or
 * leaving the field saves it (Shift+Enter adds a line).
 */
export default function PlanNoteComposer({ scopeKey, label, value, placeholder, disabled = false, onCommit }) {
    const commit = (text) => {
        if ((text || '').trim() !== (value || '')) onCommit(text);
    };
    return (
        <div className={styles.composer}>
            <textarea
                // Remount per scope so switching sets never carries a half-typed note across.
                key={`${scopeKey}:${value || ''}`}
                className={styles.composerInput}
                defaultValue={value || ''}
                placeholder={placeholder}
                aria-label={label}
                rows={1}
                maxLength={1000}
                disabled={disabled}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                    }
                }}
                onBlur={(event) => commit(event.target.value)}
            />
        </div>
    );
}
