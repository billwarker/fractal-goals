import React, { useState } from 'react';
import SharedNoteTimeline from '../notes/NoteTimeline';
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
    className = '',
}) {
    const [content, setContent] = useState('');
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
        if (!trimmed || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onSubmit(trimmed);
            setContent('');
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
            <form className={styles.composerForm} onSubmit={handleSubmit}>
                <div className={styles.inputRow}>
                    <textarea
                        ref={inputRef}
                        value={content}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={isSubmitting}
                        className={styles.textarea}
                        rows={1}
                    />
                    <button
                        type="submit"
                        disabled={!content.trim() || isSubmitting}
                        className={styles.submitBtn}
                        title="Add note (Enter, Shift+Enter for new line)"
                    >
                        {isSubmitting ? '…' : <CreateNoteIcon />}
                    </button>
                </div>
                <div className={styles.hint}>
                    Markdown supported. Press Enter to save, Shift+Enter for a new line.
                </div>
            </form>
        </div>
    );

    if (composerOnly) {
        return composer;
    }

    return (
        <div className={styles.panel}>
            <div className={styles.timelineHeader}>
                <span className={styles.timelineLabel}>
                    {label}
                    {notes.length > 0 ? ` (${notes.length})` : ''}
                </span>
            </div>

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
