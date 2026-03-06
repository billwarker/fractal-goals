import React from 'react';
import NoteItem from './NoteItem';
import styles from './NoteItem.module.css';

function NoteTimeline({
    notes,
    onUpdate,
    onDelete,
    onToggleNanoGoal,
    pendingNanoGoalIds = new Set(),
    compact = false,
    selectedNoteId,
    onNoteSelect
}) {
    if (!notes || notes.length === 0) {
        return null;
    }

    return (
        <div className={`${styles.noteTimeline} ${compact ? styles.compact : ''}`}>
            {notes.map(note => (
                <NoteItem
                    key={note.id}
                    note={note}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onToggleNanoGoal={onToggleNanoGoal}
                    nanoToggleDisabled={Boolean(note.nano_goal_id && pendingNanoGoalIds.has(note.nano_goal_id))}
                    compact={compact}
                    isSelected={selectedNoteId === note.id}
                    onSelect={() => onNoteSelect && onNoteSelect(note.id)}
                />
            ))}
        </div>
    );
}

export default NoteTimeline;
