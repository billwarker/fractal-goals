import React, { useState } from 'react';
import SharedNoteTimeline from '../notes/NoteTimeline';
import AttachMenuButton from '../notes/AttachMenuButton';
import { AttachmentDraftList, AttachmentDraftNotice } from '../notes/NoteAttachmentsEditor';
import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import CreateNoteIcon from '../atoms/CreateNoteIcon';
import styles from './SidePaneNotePanel.module.css';

function SidePaneNotePanel({
    notes = [],
    isLoading = false,
    error = false,
    onSubmit,
    onEdit,
    onDelete,
    onPin,
    onUnpin,
    hasMore = false,
    onLoadMore,
    placeholder = 'Add a note...',
    label = 'Notes',
    composerOnly = false,
    hideHeader = false,
    className = '',
    rootId = null,  // Enables attaching cloud media; onSubmit then receives (content, attachments).
}) {
    const [content, setContent] = useState('');
    const draft = useAttachmentDraft(rootId);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = React.useRef(null);

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

    const handleSubmit = async (e) => {
        e?.preventDefault();
        const trimmed = content.trim();
        if (!trimmed || isSubmitting || draft.isBusy) return;
        setIsSubmitting(true);
        try {
            await onSubmit(trimmed, draft.payload());
            setContent('');
            draft.reset();
            if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.focus();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const composer = (
        <div className={`${styles.composer} ${className}`}>
            <form className={styles.composerForm} onSubmit={handleSubmit} {...(rootId ? draft.dropProps : {})}>
                {rootId && <AttachmentDraftList draft={draft} disabled={isSubmitting} compact />}
                {rootId && <AttachmentDraftNotice draft={draft} />}
                <div className={styles.inputRow}>
                    <textarea
                        ref={inputRef}
                        value={content}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={isSubmitting}
                        onPaste={rootId ? draft.handlePaste : undefined}
                        className={styles.textarea}
                        rows={1}
                    />
                    <button
                        type="submit"
                        disabled={!content.trim() || isSubmitting || draft.isBusy}
                        className={styles.submitBtn}
                        aria-label="Add note"
                        title={draft.busyReason || (draft.items.length > 0 && !content.trim()
                            ? 'Write a few words to save with the attachment'
                            : 'Add note (Enter, Shift+Enter for new line)')}
                    >
                        {isSubmitting ? '…' : <CreateNoteIcon />}
                    </button>
                    {rootId && (
                        <AttachMenuButton draft={draft} disabled={isSubmitting} className={styles.submitBtn}
                            onPickerClosed={() => inputRef.current?.focus()} />
                    )}
                </div>
            </form>
        </div>
    );

    if (composerOnly) {
        return composer;
    }

    return (
        <div className={styles.panel}>
            {!hideHeader ? (
                <div className={styles.timelineHeader}>
                    <span className={styles.timelineLabel}>
                        {label}
                        {notes.length > 0 ? ` (${notes.length})` : ''}
                    </span>
                </div>
            ) : null}

            <div className={styles.notesList}>
                {isLoading ? (
                    <div className={styles.status}>
                        <p>Loading notes…</p>
                    </div>
                ) : error ? (
                    <div className={styles.status}>
                        <p>Notes could not be loaded.</p>
                    </div>
                ) : notes.length === 0 ? (
                    <div className={styles.empty}>No notes yet.</div>
                ) : (
                    <SharedNoteTimeline
                        notes={notes}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onPin={onPin}
                        onUnpin={onUnpin}
                        hasMore={hasMore}
                        onLoadMore={onLoadMore}
                        groupByDate={false}
                        showContext={false}
                        minimal
                        variant="flat"
                    />
                )}
            </div>

            {composer}
        </div>
    );
}

export default SidePaneNotePanel;
