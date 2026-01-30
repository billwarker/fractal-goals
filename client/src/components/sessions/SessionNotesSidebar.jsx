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
    const { timezone } = useTimezone();
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
            return { type: 'session', label: 'Session Note', className: 'context-session' };
        } else if (note.context_type === 'activity_instance' || note.context_type === 'set') {
            const activityName = getActivityName(note.activity_definition_id);
            return {
                type: 'activity',
                activityName: activityName || 'Activity',
                setIndex: note.set_index,
                className: 'context-activity'
            };
        }
        return { type: 'other', label: 'Note', className: '' };
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
                <h3 className="sidebar-title">Notes</h3>
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
                                    className={`note-item ${isSelected ? 'selected' : ''}`}
                                    onClick={(e) => handleNoteClick(e, note)}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        padding: '16px' // Explicit padding adjustment
                                    }}
                                >
                                    {context.type === 'activity' ? (
                                        <>
                                            <div style={{ marginBottom: '4px' }}>
                                                <span className={`note-context ${context.className}`} style={{ display: 'inline-block' }}>
                                                    {context.activityName}
                                                </span>
                                            </div>
                                            <div className="note-timestamp" style={{ display: 'flex', alignItems: 'center' }}>
                                                {context.setIndex !== null && context.setIndex !== undefined && (
                                                    <>
                                                        <span className="note-item-set-badge" style={{ fontSize: '10px' }}>Set {context.setIndex + 1}</span>
                                                        <span style={{ margin: '0 6px', color: '#666' }}>-</span>
                                                    </>
                                                )}
                                                {formatNoteTime(note.created_at)}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className={`note-context ${context.className}`}>
                                                {context.label}
                                            </div>
                                            <div className="note-timestamp">
                                                {formatNoteTime(note.created_at)}
                                            </div>
                                        </>
                                    )}
                                    <div className="note-content">
                                        {note.content}
                                    </div>
                                    {/* Show image if image_data is present (detail view) */}
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
                                    {/* Show image indicator if has_image but no image_data (list view) */}
                                    {note.has_image && !note.image_data && (
                                        <div
                                            className="note-image-indicator"
                                            style={{
                                                marginTop: '8px',
                                                padding: '6px 10px',
                                                background: '#333',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                color: '#888',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            📷 Image attached
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
