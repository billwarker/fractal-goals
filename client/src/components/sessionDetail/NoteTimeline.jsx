/**
 * NoteTimeline (session detail) — delegates to shared NoteTimeline.
 * Keeps the existing prop API for backward compatibility.
 */

import React from 'react';
import SharedNoteTimeline from '../notes/NoteTimeline';

function NoteTimeline({
    notes,
    onUpdate,
    onDelete,
    onPin,
    onUnpin,
    onToggleNanoGoal,
    pendingNanoGoalIds = new Set(),
    compact = false,
    selectedNoteId,
    onNoteSelect,
}) {
    if (!notes || notes.length === 0) return null;

    return (
        <SharedNoteTimeline
            notes={notes}
            onEdit={onUpdate ? (noteId, content) => onUpdate(noteId, content) : undefined}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
            onToggleNanoGoal={onToggleNanoGoal}
            pendingNanoGoalIds={pendingNanoGoalIds}
            compact={compact}
            selectedNoteId={selectedNoteId}
            onNoteSelect={(note) => onNoteSelect && onNoteSelect(note.id)}
            groupByDate={false}
            showContext={false}
            variant="flat"
        />
    );
}

export default NoteTimeline;
