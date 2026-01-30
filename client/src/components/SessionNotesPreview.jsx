/**
 * SessionNotesPreview - Expandable notes accordion for Sessions list page
 * 
 * Fetches and displays ALL notes for a session (session-level + activity instance notes).
 * Shows context indicator for activity notes (activity name).
 */

import React, { useState, useEffect } from 'react';
import { fractalApi } from '../utils/api';
import { formatDateInTimezone } from '../utils/dateUtils';
import { useTimezone } from '../contexts/TimezoneContext';
import './SessionNotesPreview.css';

function SessionNotesPreview({ rootId, sessionId }) {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activities, setActivities] = useState([]);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const { timezone } = useTimezone();

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Fetch notes and activities in parallel
                const [notesResponse, activitiesResponse] = await Promise.all([
                    fractalApi.getSessionNotes(rootId, sessionId),
                    fractalApi.getActivities(rootId)
                ]);

                // Include both session-level AND activity instance notes (exclude set-level for now)
                const allNotes = notesResponse.data.filter(n =>
                    n.context_type === 'session' || n.context_type === 'activity_instance'
                );

                // Sort by created_at descending (newest first)
                allNotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                setNotes(allNotes);
                setActivities(activitiesResponse.data || []);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch session notes:', err);
                setError('Failed to load notes');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [rootId, sessionId]);

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

    // Get activity name from definition ID
    const getActivityName = (activityDefinitionId) => {
        if (!activityDefinitionId) return null;
        const activity = activities.find(a => a.id === activityDefinitionId);
        return activity?.name || 'Activity';
    };

    // Get context label for note
    const getNoteContext = (note) => {
        if (note.context_type === 'session') {
            return { label: 'Session', className: 'context-session' };
        } else if (note.context_type === 'activity_instance') {
            const activityName = getActivityName(note.activity_definition_id);
            return { label: activityName || 'Activity', className: 'context-activity' };
        } else if (note.context_type === 'set') {
            const activityName = getActivityName(note.activity_definition_id);
            return { label: `${activityName || 'Activity'} Set ${(note.set_index || 0) + 1}`, className: 'context-set' };
        }
        return { label: 'Note', className: '' };
    };

    if (loading) {
        return (
            <div className="session-notes-preview">
                <div className="notes-loading">Loading notes...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="session-notes-preview">
                <div className="notes-error">{error}</div>
            </div>
        );
    }

    if (notes.length === 0) {
        return (
            <div className="session-notes-preview">
                <div className="notes-empty-state">No notes yet</div>
            </div>
        );
    }

    return (
        <div className="session-notes-preview">
            <div className="notes-list">
                {notes.map(note => {
                    const context = getNoteContext(note);
                    const isSelected = selectedNoteId === note.id;

                    return (
                        <div
                            key={note.id}
                            className={`note-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedNoteId(note.id)}
                            style={{
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                borderRadius: '6px',
                                padding: '16px'
                            }}
                        >
                            <div className="note-header">
                                <span className={`note-context-badge ${context.className}`}>
                                    {context.label}
                                </span>
                            </div>
                            <div className="note-timestamp">
                                {formatNoteTime(note.created_at)}
                            </div>
                            <div className="note-content">
                                {note.content}
                            </div>
                            {note.image_data && (
                                <div className="note-image">
                                    <img
                                        src={note.image_data}
                                        alt="Note attachment"
                                        style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '4px' }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default SessionNotesPreview;

