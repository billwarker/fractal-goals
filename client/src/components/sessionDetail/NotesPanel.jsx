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
import Linkify from '../atoms/Linkify';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './NotesPanel.module.css';

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
        <div className={styles.notesPanel}>
            {/* Quick Add - Session Notes Only */}
            <NoteQuickAdd
                onSubmit={handleAddNote}
                placeholder="Add a session note..."
            />

            {/* Current Session Notes */}
            <div className={styles.notesSection}>
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
                    <div className={styles.notesEmpty}>
                        No session notes yet
                    </div>
                )}
            </div>

            {/* Previous Session Notes (from last 3 sessions) */}
            {previousSessionNotes && previousSessionNotes.length > 0 && (
                <div className={styles.previousNotesSection}>
                    <div
                        className={styles.previousNotesHeader}
                        onClick={() => setShowPreviousSessionNotes(!showPreviousSessionNotes)}
                    >
                        <span className={styles.previousNotesToggle}>
                            {showPreviousSessionNotes ? '▼' : '▶'}
                        </span>
                        <h4>Previous Session Notes</h4>
                    </div>
                    {showPreviousSessionNotes && (
                        <div className={styles.previousNotesContent}>
                            {previousSessionNotes.map(session => (
                                <div key={session.session_id} className={styles.previousSessionGroup}>
                                    <div className={styles.previousSessionDate}>
                                        {session.session_date}
                                        <span className={styles.previousSessionName}>
                                            {session.session_name}
                                        </span>
                                    </div>
                                    <div className={styles.previousSessionNotes}>
                                        {session.notes.map(note => (
                                            <div
                                                key={note.id}
                                                className={`${styles.previousNoteItem} ${selectedNoteId === note.id ? styles.previousNoteItemHighlighted : ''}`}
                                                onClick={() => setSelectedNoteId(note.id)}
                                            >
                                                <Linkify>{note.content}</Linkify>
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
