/**
 * NotesPanel - Notes mode for SessionSidePane
 * 
 * Features:
 * - Quick-add input at top for session notes
 * - Timeline of session-level notes for current session
 * - Previous session notes section (session-level notes from last 3 sessions)
 * 
 * Note: Activity-level previous notes are shown in HistoryPanel instead.
 */

import React, { useState } from 'react';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';

function NotesPanel({
    rootId,
    sessionId,
    selectedActivity,
    selectedActivityDef,
    selectedSetIndex,
    onNoteAdded,
    activityInstances,
    activityDefinitions,
    refreshTrigger,
    notes,
    previousNotes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote
}) {
    const [showPreviousSessionNotes, setShowPreviousSessionNotes] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState(null);

    // Filter for Session-Level Notes (always show these)
    const sessionNotes = notes.filter(n => n.context_type === 'session');

    const handleAddNote = async (content, imageData = null) => {
        try {
            await addNote({
                context_type: 'session', // Always add as session note from sidepane
                context_id: sessionId,
                session_id: sessionId,
                content,
                image_data: imageData
            });
            onNoteAdded?.();
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    return (
        <div className="notes-panel">
            {/* Quick Add - Session Notes Only */}
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
                        selectedNoteId={selectedNoteId}
                        onNoteSelect={setSelectedNoteId}
                    />
                ) : (
                    <div className="notes-empty">
                        No session notes yet
                    </div>
                )}
            </div>

            {/* Previous Session Notes (from last 3 sessions) */}
            {previousSessionNotes && previousSessionNotes.length > 0 && (
                <div className="previous-notes-section">
                    <div
                        className="previous-notes-header"
                        onClick={() => setShowPreviousSessionNotes(!showPreviousSessionNotes)}
                    >
                        <span className="previous-notes-toggle">
                            {showPreviousSessionNotes ? '▼' : '▶'}
                        </span>
                        <h4>Previous Session Notes</h4>
                    </div>
                    {showPreviousSessionNotes && (
                        <div className="previous-notes-content">
                            {previousSessionNotes.map(session => (
                                <div key={session.session_id} className="previous-session-group">
                                    <div className="previous-session-date">
                                        {session.session_date}
                                        <span className="previous-session-name">
                                            {session.session_name}
                                        </span>
                                    </div>
                                    <div className="previous-session-notes">
                                        {session.notes.map(note => (
                                            <div
                                                key={note.id}
                                                className="previous-note-item"
                                                onClick={() => setSelectedNoteId(note.id)}
                                                style={selectedNoteId === note.id ? {
                                                    background: 'rgba(33, 150, 243, 0.15)',
                                                    borderLeft: '3px solid #2196f3',
                                                    borderLeftColor: '#2196f3', // Ensure color wins
                                                    color: '#fff',
                                                    borderRadius: '0 4px 4px 0',
                                                    paddingLeft: '8px' // Override/match CSS
                                                } : {}}
                                            >
                                                {note.content}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}


        </div>
    );
}

export default NotesPanel;
