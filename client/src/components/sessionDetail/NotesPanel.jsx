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

import React, { useMemo, useState } from 'react';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './NotesPanel.module.css';

function NotesPanel({
    sessionId,
    onNoteAdded,
    notes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote,
    pinNote,
    unpinNote,
}) {
    const [selectedNoteId, setSelectedNoteId] = useState(null);

    // Merge notes
    const combinedNotes = useMemo(() => {
        const currentSessionNotes = notes.filter(n => n.context_type === 'session');
        let allNotes = [...currentSessionNotes];

        if (previousSessionNotes && previousSessionNotes.length > 0) {
            previousSessionNotes.forEach(session => {
                const pastNotes = session.notes.map(n => ({
                    ...n,
                    isPast: true,
                    session_name: session.session_name,
                    session_date: session.session_date
                }));
                allNotes = [...allNotes, ...pastNotes];
            });
        }

        return allNotes.sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) {
                return a.is_pinned ? -1 : 1;
            }
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }, [notes, previousSessionNotes]);

    const handleAddNote = async (content) => {
        try {
            await addNote({
                context_type: 'session', // Always add as session note from sidepane
                context_id: sessionId,
                session_id: sessionId,
                content,
            });
            onNoteAdded?.();
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    return (
        <div className={styles.notesPanel}>
            <div className={styles.notesSection}>
                <h4>
                    Session Notes
                    {combinedNotes.length > 0 && ` (${combinedNotes.length})`}
                </h4>
            </div>

            {/* Unified Session Notes Timeline */}
            <div className={styles.notesListContainer}>
                {combinedNotes.length > 0 ? (
                    <NoteTimeline
                        notes={combinedNotes}
                        onUpdate={updateNote}
                        onDelete={deleteNote}
                        onPin={pinNote}
                        onUnpin={unpinNote}
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

            {/* Quick Add - Always at the bottom */}
            <div className={styles.notesInputContainer}>
                <NoteQuickAdd
                    onSubmit={handleAddNote}
                    placeholder="Add a session note..."
                />
            </div>
        </div>
    );
}

export default NotesPanel;
