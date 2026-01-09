/**
 * NotesPanel - Notes mode for SessionSidePane
 * 
 * Features:
 * - Quick-add input at top
 * - Timeline of notes for current session
 * - Previous session notes section (when activity is selected)
 */

import React from 'react';
import { useSessionNotes } from '../../hooks/useSessionNotes';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import PreviousNotesSection from './PreviousNotesSection';

function NotesPanel({ rootId, sessionId, selectedActivity, selectedActivityDef, onNoteAdded }) {
    const activityDefId = selectedActivityDef?.id || null;

    const {
        notes,
        previousNotes,
        loading,
        addNote,
        updateNote,
        deleteNote
    } = useSessionNotes(rootId, sessionId, activityDefId);

    const handleAddNote = async (content, setIndex = null) => {
        try {
            await addNote({
                context_type: selectedActivity ? 'activity_instance' : 'session',
                context_id: selectedActivity?.id || sessionId,
                session_id: sessionId,
                activity_instance_id: selectedActivity?.id || null,
                activity_definition_id: activityDefId,
                set_index: setIndex,
                content
            });
            onNoteAdded?.();
        } catch (err) {
            console.error('Failed to add note:', err);
            // Could show toast notification here
        }
    };

    // Filter notes based on selected activity
    const displayNotes = selectedActivity
        ? notes.filter(n => n.activity_instance_id === selectedActivity.id)
        : notes.filter(n => n.context_type === 'session');

    const allActivityNotes = selectedActivity
        ? notes.filter(n => n.activity_instance_id === selectedActivity.id)
        : [];

    return (
        <div className="notes-panel">
            {/* Quick Add */}
            <NoteQuickAdd
                onSubmit={handleAddNote}
                placeholder={selectedActivity
                    ? `Note for ${selectedActivityDef?.name || 'activity'}...`
                    : 'Add a session note...'
                }
            />

            {/* Current Session Notes */}
            <div className="notes-section">
                <h4>
                    {selectedActivity ? 'This Activity' : 'This Session'}
                    {displayNotes.length > 0 && ` (${displayNotes.length})`}
                </h4>
                {loading ? (
                    <div className="notes-loading">Loading notes...</div>
                ) : displayNotes.length > 0 ? (
                    <NoteTimeline
                        notes={displayNotes}
                        onUpdate={updateNote}
                        onDelete={deleteNote}
                    />
                ) : (
                    <div className="notes-empty">
                        {selectedActivity
                            ? 'No notes for this activity yet'
                            : 'No session notes yet'
                        }
                    </div>
                )}
            </div>

            {/* All Activity Notes (when activity is selected, show other notes from this session) */}
            {selectedActivity && notes.filter(n => n.context_type === 'session').length > 0 && (
                <div className="notes-section notes-section-secondary">
                    <h4>Session Notes ({notes.filter(n => n.context_type === 'session').length})</h4>
                    <NoteTimeline
                        notes={notes.filter(n => n.context_type === 'session')}
                        onUpdate={updateNote}
                        onDelete={deleteNote}
                        compact
                    />
                </div>
            )}

            {/* Previous Session Notes (only when activity selected) */}
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
