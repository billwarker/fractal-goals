import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useTimezone } from '../../contexts/TimezoneContext';
import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import { useGoalActivityHeatmap } from '../../hooks/useGoalActivityHeatmap';
import { useGoalNotes } from '../../hooks/useGoalNotes';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { describeGoalDue } from '../../utils/goalDueFormat';
import { REVIEW_PROMPTS, REVIEW_STATUSES, getGoalReview, reviewContext } from '../../utils/goalReview';
import Button from '../atoms/Button';
import AttachMenuButton from '../notes/AttachMenuButton';
import { AttachmentDraftList, AttachmentDraftNotice } from '../notes/NoteAttachmentsEditor';
import MarkdownNoteContent from '../notes/MarkdownNoteContent';
import ReviewNoteBody from '../notes/ReviewNoteBody';
import styles from './GoalReviewForm.module.css';

const read = (goal, key) => goal?.[key] ?? goal?.attributes?.[key];
const EMPTY_ANSWERS = { status: null, went_well: '', change: '', next_focus: '' };
const pickAnswers = (reviewData) => Object.fromEntries(Object.keys(EMPTY_ANSWERS)
    .filter((key) => reviewData?.[key] != null)
    .map((key) => [key, reviewData[key]]));

function LastReview({ note }) {
    if (!note) return null;
    return (
        <details className={styles.lastReview}>
            <summary>Last review</summary>
            {note.review_data
                ? <ReviewNoteBody review={note.review_data} />
                : <MarkdownNoteContent content={note.content} />}
        </details>
    );
}

/**
 * Writing a goal review: what changed since the last review, read-only, above a few plain
 * questions. The answers are saved as `review_data`; saving restarts the review cadence.
 * With `registerFooterAction`, Save and Cancel live in the host's footer instead of the form.
 * With `editingNote`, the form edits that review's answers; its attachments stay managed from its note card.
 */
export default function GoalReviewForm({
    rootId, goal, goalId, onSubmit, onCancel, isSaving = false, registerFooterAction, editingNote = null,
}) {
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
    const formId = useId();
    const formRef = useRef(null);
    const [answers, setAnswers] = useState(() => ({ ...EMPTY_ANSWERS, ...pickAnswers(editingNote?.review_data) }));
    const [error, setError] = useState('');
    const draft = useAttachmentDraft(rootId);
    const { data: heatmap } = useGoalActivityHeatmap(rootId, goalId, { timezone: timezone || 'UTC' });
    const { notes } = useGoalNotes(rootId, goalId, { includeActivityInstanceNotes: false });
    const lastReviewNote = useMemo(() => notes
        .filter((note) => note.note_kind === 'goal_review' && note.id !== editingNote?.id)
        .reduce((latest, note) => (!latest || note.created_at > latest.created_at ? note : latest), null), [editingNote?.id, notes]);

    const context = reviewContext({
        description: read(goal, 'description'),
        lastReviewOn: getGoalReview(goal)?.last_review_on,
        children: (goal?.children || []).filter((child) => !read(child, 'deleted_at')).map((child) => ({
            completed: read(child, 'completed'), completed_at: read(child, 'completed_at'),
        })),
        activityDays: heatmap?.days || [],
        dueLabel: describeGoalDue(read(goal, 'deadline'), today)?.description || null,
        today,
    });
    const hasAnswer = Boolean(answers.status || REVIEW_PROMPTS.some((prompt) => answers[prompt.key].trim()));
    const busy = isSaving || draft.isBusy;

    const saveLabel = isSaving ? 'Saving…' : (editingNote ? 'Save changes' : 'Save review');
    const saveDisabled = !hasAnswer || busy;
    useEffect(() => {
        if (!registerFooterAction) return undefined;
        registerFooterAction({
            label: saveLabel,
            disabled: saveDisabled,
            title: draft.busyReason || undefined,
            onClick: () => formRef.current?.requestSubmit(),
        });
        return undefined;
    }, [draft.busyReason, registerFooterAction, saveDisabled, saveLabel]);
    useEffect(() => () => registerFooterAction?.(null), [registerFooterAction]);

    const submit = async (event) => {
        event.preventDefault();
        if (!hasAnswer || busy) return;
        setError('');
        const saved = await onSubmit({ schema: 1, ...answers }, draft.payload());
        if (saved === false) setError('The review could not be saved. Your answers are still here.');
    };

    return (
        <form ref={formRef} className={styles.form} onSubmit={submit} aria-label={`Review ${read(goal, 'name') || 'goal'}`} {...draft.dropProps}>
            <section className={styles.context} aria-label="Review context">
                <h3>{context.since}</h3>
                <p className={context.description ? styles.description : styles.muted}>
                    {context.description || 'No description yet.'}
                </p>
                <ul className={styles.facts}>
                    {context.facts.map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
                <LastReview note={lastReviewNote} />
            </section>

            <fieldset className={styles.status}>
                <legend>How is this goal going?</legend>
                <div className={styles.statusOptions}>
                    {REVIEW_STATUSES.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            data-status={option.value}
                            aria-pressed={answers.status === option.value}
                            onClick={() => setAnswers((current) => ({
                                ...current, status: current.status === option.value ? null : option.value,
                            }))}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </fieldset>

            {REVIEW_PROMPTS.map((prompt) => (
                <label key={prompt.key} className={styles.prompt} htmlFor={`${formId}-${prompt.key}`}>
                    <span>{prompt.label}</span>
                    <textarea
                        id={`${formId}-${prompt.key}`}
                        rows={3}
                        maxLength={2000}
                        value={answers[prompt.key]}
                        onChange={(event) => setAnswers((current) => ({ ...current, [prompt.key]: event.target.value }))}
                        onPaste={draft.handlePaste}
                    />
                </label>
            ))}

            <AttachmentDraftList draft={draft} disabled={isSaving} compact />
            <AttachmentDraftNotice draft={draft} />
            {error ? <p role="alert" className={styles.error}>{error}</p> : null}

            <div className={styles.actions}>
                {!registerFooterAction ? (
                    <Button type="submit" variant="primary" disabled={saveDisabled} title={draft.busyReason || undefined}>
                        {saveLabel}
                    </Button>
                ) : null}
                {!editingNote ? <AttachMenuButton draft={draft} disabled={isSaving} placement="up" /> : null}
                {onCancel && !registerFooterAction
                    ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    : null}
            </div>
        </form>
    );
}
