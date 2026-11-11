/**
 * NoteComposer — full markdown compose UI for goal notes (GoalNotesView).
 * The note is written for `prelinkedGoalId`; quick bars elsewhere use NoteQuickAdd.
 */

import React, { useState, useRef, useEffect } from 'react';
import CreateNoteIcon from '../atoms/CreateNoteIcon';
import MarkdownNoteContent from './MarkdownNoteContent';
import NoteAttachmentsEditor from './NoteAttachmentsEditor';
import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import { parseVideoUrl } from '../../utils/videoEmbeds';
import styles from './NoteComposer.module.css';

function NoteComposer({
    rootId,
    onSubmit,       // (content, goalId, activityDefinitionId, attachments) => Promise
    onCancel,
    initialAttachments = [],
    initialContent = '',      // pre-populate for edit mode
    submitLabel,              // override submit button label
    prelinkedGoalId = null,   // the goal the note is written for
    isSubmitting: externalSubmitting = false,
}) {
    const [content, setContent] = useState(initialContent);
    const draft = useAttachmentDraft(rootId, initialAttachments);
    const [previewMode, setPreviewMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const textareaRef = useRef(null);

    // All note surfaces support markdown + inline video embeds, so the
    // Write/Preview toggle is always available regardless of goal/activity links.

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            adjustHeight(textareaRef.current);
        }
    }, []);

    const handleSubmit = async () => {
        if (!content.trim() || isSubmitting || externalSubmitting || draft.isBusy) return;
        setSubmitError('');
        setIsSubmitting(true);
        try {
            const saved = await onSubmit(content.trim(), prelinkedGoalId, null, draft.payload());
            if (saved === false) throw new Error('The note could not be saved. Your draft is still here.');
            draft.reset();
            setContent('');
            setPreviewMode(false);
        } catch (error) {
            setSubmitError(error?.response?.data?.error || error?.message || 'The note could not be saved. Try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Paste-to-embed: when the clipboard holds a single recognized video URL,
    // insert it on its own line (blank lines around it) so it satisfies the
    // "own line" embed rule without the user needing to know it.
    const handlePaste = (e) => {
        if (draft.handlePaste(e)) return;  // Pasted pictures upload into connected storage.
        const pasted = (e.clipboardData?.getData('text') || '').trim();
        if (!pasted || /\s/.test(pasted) || !parseVideoUrl(pasted)) return;

        const el = e.target;
        const start = el.selectionStart ?? content.length;
        const end = el.selectionEnd ?? content.length;
        const before = content.slice(0, start);
        const after = content.slice(end);

        const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
        const suffix = after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
        const insertion = `${prefix}${pasted}${suffix}`;
        const next = before + insertion + after;

        e.preventDefault();
        setContent(next);
        requestAnimationFrame(() => {
            adjustHeight(el);
            const caret = before.length + insertion.length;
            el.setSelectionRange(caret, caret);
        });
    };

    return (
        <div className={styles.composer}>
            {submitError && <p role="alert">{submitError}</p>}
            <div className={styles.composerBody}>
                {/* Left: write/preview area */}
                <div className={styles.writeArea} {...draft.dropProps}>
                    <div className={styles.writeToolbar}>
                        <button
                            className={[styles.modeBtn, !previewMode ? styles.modeBtnActive : ''].filter(Boolean).join(' ')}
                            onClick={() => setPreviewMode(false)}
                            type="button"
                        >
                            Write
                        </button>
                        <button
                            className={[styles.modeBtn, previewMode ? styles.modeBtnActive : ''].filter(Boolean).join(' ')}
                            onClick={() => setPreviewMode(true)}
                            type="button"
                        >
                            Preview
                        </button>
                    </div>

                    {previewMode ? (
                        <div className={styles.previewPane}>
                            {content.trim() ? (
                                <div className={styles.markdownPreview}>
                                    <MarkdownNoteContent content={content} />
                                </div>
                            ) : (
                                <span className={styles.previewEmpty}>Nothing to preview.</span>
                            )}
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            className={styles.textarea}
                            value={content}
                            onChange={(e) => { setContent(e.target.value); adjustHeight(e.target); }}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="Write a note… (Markdown supported; paste a YouTube, Instagram, Google Drive, or direct video link to embed it. ⌘Enter to submit)"
                            rows={4}
                        />
                    )}

                    <NoteAttachmentsEditor draft={draft} disabled={isSubmitting || externalSubmitting} />

                    <div className={styles.submitRow}>
                        <button
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={!content.trim() || isSubmitting || externalSubmitting || draft.isBusy}
                            title={draft.busyReason || undefined}
                            type="button"
                        >
                            {isSubmitting ? (
                                'Saving…'
                            ) : (
                                <>
                                    <CreateNoteIcon className={styles.submitIcon} />
                                    {submitLabel || 'Save note'}
                                </>
                            )}
                        </button>
                        {onCancel && (
                            <button className={styles.cancelBtn} onClick={onCancel} type="button">
                                Cancel
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}


export default NoteComposer;
