/**
 * NoteTimeline - Chronological list of notes
 */

import React from 'react';
import NoteItem from './NoteItem';

function NoteTimeline({ notes, onUpdate, onDelete, compact = false }) {
    if (!notes || notes.length === 0) {
        return null;
    }

    return (
        <div className={`note-timeline ${compact ? 'compact' : ''}`}>
            {notes.map(note => (
                <NoteItem
                    key={note.id}
                    note={note}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    compact={compact}
                />
            ))}
        </div>
    );
}

export default NoteTimeline;
