import React, { useMemo, useState } from 'react';

import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './TimelinePanel.module.css';

function SessionNotesPanel({
    sessionId,
    onNoteAdded,
    notes = [],
    previousSessionNotes = [],
    addNote,
    updateNote,
    deleteNote,
    pinNote,
    unpinNote,
    className = '',
}) {
    const [selectedNoteId, setSelectedNoteId] = useState(null);

    const combinedNotes = useMemo(() => {
        const currentSessionNotes = notes.filter((note) => note.context_type === 'session');
        let allNotes = [...currentSessionNotes];

        if (previousSessionNotes?.length > 0) {
            previousSessionNotes.forEach((sessionNoteGroup) => {
                const pastNotes = (sessionNoteGroup.notes || []).map((note) => ({
                    ...note,
                    isPast: true,
                    session_name: sessionNoteGroup.session_name,
                    session_date: sessionNoteGroup.session_date,
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
        if (!addNote) return;

        try {
            await addNote({
                context_type: 'session',
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
        <div className={`${styles.timelinePanel} ${className}`}>
            <div className={styles.timelineBody}>
                <section className={styles.timelineSection}>
                    <div className={styles.timelineSectionHeader}>
                        Session Notes
                        {combinedNotes.length > 0 && ` (${combinedNotes.length})`}
                    </div>
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
                        <div className={styles.timelineEmpty}>No session notes yet</div>
                    )}
                </section>
            </div>

            <div className={styles.timelineComposer}>
                <NoteQuickAdd
                    onSubmit={handleAddNote}
                    placeholder="Add a session note..."
                />
            </div>
        </div>
    );
}

export default SessionNotesPanel;
