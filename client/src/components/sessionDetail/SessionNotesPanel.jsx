import React, { useMemo, useState } from 'react';

import { carriedNotesForSession } from '../../utils/carriedNotes';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './ProgressPanel.module.css';
import { logError } from '../../utils/logger';

function SessionNotesPanel({
    rootId,
    sessionId,
    onNoteAdded,
    notes = [],
    previousSessionNotes = [],
    addNote,
    updateNote,
    deleteNote,
    carriedNotes = null,
    setCarryForward,
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

        allNotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        // Notes pinned to this session from an earlier one come first.
        return [...carriedNotesForSession(carriedNotes, sessionId), ...allNotes];
    }, [notes, previousSessionNotes, carriedNotes, sessionId]);

    const handleAddNote = async (content, attachments = []) => {
        if (!addNote) return;

        try {
            await addNote({
                context_type: 'session',
                context_id: sessionId,
                session_id: sessionId,
                content,
                ...(attachments.length ? { attachments } : {}),
            });
            onNoteAdded?.();
        } catch (err) {
            logError('Failed to add note:', err);
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
                            onCarryForward={setCarryForward}
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
                    rootId={rootId}
                    onSubmit={handleAddNote}
                    placeholder="Add a session note..."
                />
            </div>
        </div>
    );
}

export default SessionNotesPanel;
