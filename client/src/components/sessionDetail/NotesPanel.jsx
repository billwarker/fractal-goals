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

function NotesPanel({
    rootId,
    sessionId,
    selectedActivity,
    selectedActivityDef,
    onNoteAdded,
    activityInstances,
    activityDefinitions,
    refreshTrigger
}) {
    const activityDefId = selectedActivityDef?.id || null;

    const {
        notes,
        previousNotes,
        loading,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes,
        error
    } = useSessionNotes(rootId, sessionId, activityDefId);

    // Refresh when external trigger changes
    React.useEffect(() => {
        if (refreshTrigger) {
            refreshNotes();
        }
    }, [refreshTrigger, refreshNotes]);

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

    // Helper to get activity name for a note
    const getActivityName = (note) => {
        if (note.context_type !== 'activity_instance' || !note.activity_instance_id) return null;

        // Try finding instance first
        const instance = activityInstances?.find(i => i.id === note.activity_instance_id);
        if (instance) {
            // Find definition
            const def = activityDefinitions?.find(d => d.id === instance.activity_definition_id);
            return def?.name || instance.name || 'Unknown Activity';
        }
        return null;
    };

    // Filter and enhance notes based on selection
    const rawDisplayNotes = selectedActivity
        ? notes.filter(n => n.activity_instance_id === selectedActivity.id)
        : notes; // Show ALL notes if no activity selected

    const displayNotes = rawDisplayNotes.map(note => ({
        ...note,
        activityName: getActivityName(note)
    }));

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

            {error && (
                <div style={{ padding: '10px', color: '#f44336', fontSize: '12px', textAlign: 'center' }}>
                    Error: {error}
                </div>
            )}

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
