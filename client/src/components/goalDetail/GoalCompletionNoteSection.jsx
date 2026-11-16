import React, { useEffect, useRef, useState } from 'react';

import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import useGoalCompletionNoteActions from '../../hooks/useGoalCompletionNoteActions';
import Button from '../atoms/Button';
import CompletionNoteFields from '../goals/CompletionNoteFields';
import styles from './GoalReviewBanner.module.css';

/** "Goal completed — add a note?" at the top of a completed goal's details, until written or dismissed. */
export function GoalCompletionNotePrompt({ rootId, goalId, onWrite }) {
    const { isSaving, dismissPrompt } = useGoalCompletionNoteActions(rootId, goalId);
    return (
        <div className={styles.banner} role="region" aria-label="Add a completion note">
            <div className={styles.text}>
                <strong>Goal completed — add a note?</strong>
                <span>Record your thoughts on this achievement.</span>
            </div>
            <div className={styles.actions}>
                <Button size="sm" onClick={onWrite} disabled={isSaving}>Write note</Button>
                <Button size="sm" variant="ghost" onClick={dismissPrompt} disabled={isSaving}>Dismiss</Button>
            </div>
        </div>
    );
}

/** Writing a completed goal's note; Save sits in the host's footer. Calls `onDone` once saved. */
export function GoalCompletionNoteComposer({ rootId, goalId, onDone, registerFooterAction }) {
    const { isSaving, writeNote } = useGoalCompletionNoteActions(rootId, goalId);
    const draft = useAttachmentDraft(rootId);
    const [content, setContent] = useState('');
    const formRef = useRef(null);
    const empty = !content.trim() && draft.payload().length === 0;
    const blocked = empty || isSaving || draft.isBusy;

    useEffect(() => {
        if (!registerFooterAction) return undefined;
        registerFooterAction({
            label: isSaving ? 'Saving…' : 'Save note',
            disabled: blocked,
            title: draft.busyReason || undefined,
            onClick: () => formRef.current?.requestSubmit(),
        });
        return undefined;
    }, [blocked, draft.busyReason, isSaving, registerFooterAction]);
    useEffect(() => () => registerFooterAction?.(null), [registerFooterAction]);

    const submit = async (event) => {
        event.preventDefault();
        if (blocked) return;
        if (await writeNote(content, draft.payload())) onDone();
    };

    return (
        <form ref={formRef} aria-label="Goal completion note" onSubmit={submit} {...draft.dropProps}>
            <CompletionNoteFields
                label="Goal Completion Note"
                value={content}
                onChange={setContent}
                attachmentDraft={rootId ? draft : null}
                autoFocus
            />
        </form>
    );
}
