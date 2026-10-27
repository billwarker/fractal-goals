/**
 * NoteQuickAdd - Quick input for adding notes
 *
 * Enter submits. With a rootId, pictures and video can be attached from this device or cloud
 * storage, or pasted/dropped; onSubmit then receives (content, attachments) where attachments
 * are finished uploads in the server's serialized shape (useful for optimistic rendering).
 */

import React, { useState, useRef } from 'react';
import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import CreateNoteIcon from '../atoms/CreateNoteIcon';
import AttachMenuButton from '../notes/AttachMenuButton';
import { AttachmentDraftList, AttachmentDraftNotice } from '../notes/NoteAttachmentsEditor';
import styles from './NoteQuickAdd.module.css';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note...", rootId = null }) {
    const [content, setContent] = useState('');
    const draft = useAttachmentDraft(rootId);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef(null);

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    const handleChange = (e) => {
        setContent(e.target.value);
        adjustHeight(e.target);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Reset height on submit
    const handleSubmit = async (e) => {
        e?.preventDefault();

        const trimmedContent = content.trim();
        if (!trimmedContent || isSubmitting || draft.isBusy) return;

        setIsSubmitting(true);
        try {
            await onSubmit(trimmedContent, draft.attachments());
            setContent('');
            draft.reset();
            if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.focus();
            }
        } catch {
            // Error handling done in parent
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form className={styles.noteQuickAdd} onSubmit={handleSubmit} {...(rootId ? draft.dropProps : {})}>
            {rootId && <AttachmentDraftList draft={draft} disabled={isSubmitting} compact />}
            {rootId && <AttachmentDraftNotice draft={draft} />}
            <div className={styles.noteInputRow}>
                <textarea
                    ref={inputRef}
                    value={content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={rootId ? draft.handlePaste : undefined}
                    placeholder={placeholder}
                    disabled={isSubmitting}
                    className={styles.quickAddTextarea}
                    rows={1}
                />
                {rootId && (
                    <AttachMenuButton draft={draft} disabled={isSubmitting} className={styles.noteSubmitBtn}
                        onPickerClosed={() => inputRef.current?.focus()} />
                )}
                <button
                    type="submit"
                    disabled={!content.trim() || isSubmitting || draft.isBusy}
                    className={styles.noteSubmitBtn}
                    aria-label="Add note"
                    title={draft.busyReason || 'Add note (Enter, Shift+Enter for new line)'}
                >
                    {isSubmitting ? '...' : <CreateNoteIcon />}
                </button>
            </div>
        </form>
    );
}

export default NoteQuickAdd;
