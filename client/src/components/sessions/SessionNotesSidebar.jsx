/**
 * SessionNotesSidebar - Timeline of all notes
 * 
 * Displays a continuous timeline of notes from all sessions.
 * - Shows all notes sorted by date
 * - Highlights notes from the selected session
 * - Auto-scrolls to notes when a session is selected
 * - Selects session when a note is clicked
 */

import React, { useState, useEffect, useRef } from 'react';
import { formatDateInTimezone } from '../../utils/dateUtils';
import { useTimezone } from '../../contexts/TimezoneContext';
import ImageViewerModal from '../sessionDetail/ImageViewerModal';
import './SessionNotesSidebar.css';

function SessionNotesSidebar({
    rootId,
    selectedSessionId,
    selectedNoteId,
    sessions = [],
    activities = [],
    onSelectSession,
    onSelectNote
}) {
    const [allNotes, setAllNotes] = useState([]);
    const [viewImage, setViewImage] = useState(null);
    const timezone = useTimezone();
    const scrollContainerRef = useRef(null);
    const firstNoteRefs = useRef({});

    // Process notes from sessions
    useEffect(() => {
        const notes = [];
        firstNoteRefs.current = {};

        sessions.forEach(session => {
            if (session.notes && session.notes.length > 0) {
                session.notes.forEach(note => {
                    notes.push({
                        ...note,
                        // Fallback to session ID if missing (shouldn't be)
                        session_id: note.session_id || session.id
                    });
                });
            }
        });

        // Sort descending (newest first)
        notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setAllNotes(notes);
    }, [sessions]);

    // Format helpers
    const formatNoteTime = (dateString) => {
        if (!dateString) return '';
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const getActivityName = (activityDefinitionId) => {
        if (!activityDefinitionId) return null;
        const activity = activities.find(a => a.id === activityDefinitionId);
        return activity?.name || 'Activity';
    };

    const getNoteContext = (note) => {
        if (note.context_type === 'session') {
            return { label: 'Session Note', className: 'context-session' };
        } else if (note.context_type === 'activity_instance') {
            const activityName = getActivityName(note.activity_definition_id);
            return { label: activityName || 'Activity', className: 'context-activity' };
        }
        return { label: 'Note', className: '' };
    };

    const handleNoteClick = (e, note) => {
        e.stopPropagation();
        if (onSelectNote) onSelectNote(note.id);
        if (note.session_id && onSelectSession) {
            onSelectSession(note.session_id);
        }
    };

    return (
        <div className="session-notes-sidebar">
            <div className="sidebar-header">
                <h3 className="sidebar-title">Notes Timeline</h3>
                <div className="sidebar-subtitle">
                    {allNotes.length} notes total
                </div>
            </div>

            <div className="sidebar-content" ref={scrollContainerRef}>
                {allNotes.length === 0 ? (
                    <div className="sidebar-empty">
                        No notes found in any session.
                    </div>
                ) : (
                    <div className="notes-timeline">
                        {allNotes.map((note, index) => {
                            const context = getNoteContext(note);
                            const isSelected = note.id === selectedNoteId;

                            return (
                                <div
                                    key={note.id}
                                    className="note-item"
                                    onClick={(e) => handleNoteClick(e, note)}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        // Match session card highlighting (Full border)
                                        border: isSelected ? '1px solid #2196f3' : '1px solid transparent',
                                        background: isSelected ? '#1a2a3a' : '#252525',
                                        borderRadius: '6px',
                                        padding: '16px' // Explicit padding adjustment
                                    }}
                                >
                                    <div className={`note-context ${context.className}`}>
                                        {context.label}
                                    </div>
                                    <div className="note-timestamp">
                                        {formatNoteTime(note.created_at)}
                                    </div>
                                    <div className="note-content">
                                        {note.content}
                                    </div>
                                    {note.image_data && (
                                        <div
                                            className="note-image"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewImage(note.image_data);
                                            }}
                                            style={{ cursor: 'zoom-in' }}
                                        >
                                            <img
                                                src={note.image_data}
                                                alt="Note attachment"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {viewImage && (
                <ImageViewerModal
                    imageData={viewImage}
                    onClose={() => setViewImage(null)}
                />
            )}
        </div>
    );
}

export default SessionNotesSidebar;
