/**
 * NoteItem - Thin wrapper around the shared NoteCard component.
 * Keeps the existing prop API for session detail compatibility.
 */

import React from 'react';
import NoteCard from '../notes/NoteCard';

function NoteItem({ note, onUpdate, onDelete, onPin, onUnpin, onToggleNanoGoal, nanoToggleDisabled = false, compact = false, isSelected, onSelect }) {
    return (
        <NoteCard
            note={note}
            onEdit={onUpdate ? (noteId, content) => onUpdate(noteId, content) : undefined}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
            onToggleNanoGoal={onToggleNanoGoal}
            nanoToggleDisabled={nanoToggleDisabled}
            compact={compact}
            isSelected={isSelected}
            onSelect={onSelect}
            showContext={false}
        />
    );
}

export default NoteItem;
