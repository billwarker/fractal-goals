/**
 * GoalNotesView — notes tab shown inside GoalDetailModal.
 *
 * Uses the shared NoteTimeline + NoteComposer.
 * Supports include_descendants toggle and include session/activity notes checkboxes.
 */

import React, { useState } from 'react';
import { NoteTimeline, NoteComposer } from '../notes';
import Button from '../atoms/Button';
import { useGoalNotes } from '../../hooks/useGoalNotes';
import styles from './GoalNotesView.module.css';

function GoalNotesView({ rootId, goalId, hideComposer = false, readOnlyNotes = null }) {
    const [includeDescendants, setIncludeDescendants] = useState(false);
    const [composing, setComposing] = useState(false);
    const isReadOnly = Array.isArray(readOnlyNotes);

    const {
        notes: fetchedNotes,
        isLoading: fetchedLoading,
        createNote,
        updateNote,
        deleteNote,
        pinNote,
        unpinNote,
    } = useGoalNotes(rootId, goalId, { includeDescendants });

    const notes = isReadOnly ? readOnlyNotes : fetchedNotes;
    const isLoading = isReadOnly ? false : fetchedLoading;

    const handleCompose = async (content, linkedGoalId, activityDefinitionId) => {
        // Pre-linked to this goal; any linked goal from picker overrides
        const targetGoalId = linkedGoalId || goalId;
        await createNote({
            content,
            context_type: 'goal',
            context_id: targetGoalId,
            goal_id: targetGoalId,
            activity_definition_id: activityDefinitionId || undefined,
        });
        setComposing(false);
    };

    return (
        <div className={styles.container}>
            {/* Options row — hidden in read-only since descendants/composer can't fetch */}
            {!isReadOnly && (
            <div className={styles.optionsRow}>
                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={includeDescendants}
                        onChange={(e) => setIncludeDescendants(e.target.checked)}
                        className={styles.checkbox}
                    />
                    Include descendant goal notes
                </label>

                {!hideComposer && !composing && (
                    <Button
                        variant="primary"
                        size="sm"
                        className={styles.writeBtn}
                        onClick={() => setComposing(true)}
                        type="button"
                    >
                        + Write Note
                    </Button>
                )}
            </div>
            )}

            {/* Compose area */}
            {!isReadOnly && !hideComposer && composing && (
                <div className={styles.composeArea}>
                    <NoteComposer
                        rootId={rootId}
                        onSubmit={handleCompose}
                        onCancel={() => setComposing(false)}
                        prelinkedGoalId={goalId}
                        prelinkedGoalName={null}
                    />
                </div>
            )}

            {/* Timeline */}
            <div className={styles.timelineArea}>
                {isLoading ? (
                    <div className={styles.loading}>Loading notes…</div>
                ) : (
                    <NoteTimeline
                        notes={notes}
                        onEdit={isReadOnly ? undefined : updateNote}
                        onDelete={isReadOnly ? undefined : deleteNote}
                        onPin={isReadOnly ? undefined : pinNote}
                        onUnpin={isReadOnly ? undefined : unpinNote}
                        groupByDate={true}
                        showContext={includeDescendants}
                        showTypePill={false}
                        emptyMessage="No notes on this goal yet."
                    />
                )}
            </div>
        </div>
    );
}

export default GoalNotesView;
