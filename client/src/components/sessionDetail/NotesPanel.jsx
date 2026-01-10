/**
 * NotesPanel - Notes mode for SessionSidePane
 * 
 * Features:
 * - Quick-add input at top
 * - Timeline of notes for current session
 * - Previous session notes section (when activity is selected)
 */

import React from 'react';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import PreviousNotesSection from './PreviousNotesSection';

function NotesPanel({
    rootId,
    sessionId,
    selectedActivity,
    selectedActivityDef,
    onNoteAdded,
    activityInstances,
    activityDefinitions,
    refreshTrigger,
    notes,
    previousNotes,
    addNote,
    updateNote,
    deleteNote
}) {
    // Filter for Session-Level Notes (always show these)
    const sessionNotes = notes.filter(n => n.context_type === 'session');

    // Filter for Activity-Level Notes (only if needed, but user requested they stay on card)
    // We will NOT show current activity notes here based on request.

    const handleAddNote = async (content) => {
        try {
            await addNote({
                context_type: 'session', // Always add as session note from sidepane
                context_id: sessionId,
                session_id: sessionId,
                content
            });
            onNoteAdded?.();
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    return (
        <div className="notes-panel">
            {/* Quick Add - Always for Session Notes */}
            <NoteQuickAdd
                onSubmit={handleAddNote}
                placeholder="Add a session note..."
            />

            {/* Current Session Notes */}
            <div className="notes-section">
                <h4>
                    Session Notes
                    {sessionNotes.length > 0 && ` (${sessionNotes.length})`}
                </h4>
                {sessionNotes.length > 0 ? (
                    <NoteTimeline
                        notes={sessionNotes}
                        onUpdate={updateNote}
                        onDelete={deleteNote}
                        compact={false}
                    />
                ) : (
                    <div className="notes-empty">
                        No session notes yet
                    </div>
                )}
            </div>

            {/* Previous Session Notes (for selected activity) */}
            {selectedActivityDef && previousNotes.length > 0 && (
                <PreviousNotesSection
                    notes={previousNotes}
                    activityName={selectedActivityDef.name}
                />
            )}
        </div>
    );
}

export default NotesPanel;
