/**
 * NotesMode - Notes viewing and editing mode for the SidePane
 * 
 * Features:
 * - Context view: Notes for current entity + descendants
 * - Feed view: Chronological feed of all notes
 * - Note creation with Cmd+Enter
 * - Grouped display by entity
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSidePane } from '../SidePaneContext';
import { fractalApi } from '../../../utils/api';
import { formatDistanceToNow } from 'date-fns';

const NotesMode = () => {
    const { activeContext } = useSidePane();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('context'); // 'context' | 'feed'
    const [newNoteContent, setNewNoteContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const rootId = activeContext?.rootId;
    const entityType = activeContext?.entityType;
    const entityId = activeContext?.entityId;
    const includeChildren = activeContext?.includeChildNotes ?? true;

    // Fetch notes
    const fetchNotes = useCallback(async () => {
        if (!rootId) return;

        setLoading(true);
        setError(null);

        try {
            let response;

            if (viewMode === 'context' && entityType && entityId) {
                response = await fractalApi.getNotes(rootId, {
                    entity_type: entityType,
                    entity_id: entityId,
                    include_children: includeChildren,
                    limit: 100
                });
            } else {
                response = await fractalApi.getNotesFeed(rootId, { limit: 100 });
            }

            setNotes(response.notes || []);
        } catch (err) {
            console.error('Failed to fetch notes:', err);
            setError('Failed to load notes');
        } finally {
            setLoading(false);
        }
    }, [rootId, entityType, entityId, includeChildren, viewMode]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    // Add note
    const handleAddNote = async (e) => {
        e?.preventDefault();

        if (!newNoteContent.trim() || !rootId || !entityType || !entityId || submitting) {
            return;
        }

        setSubmitting(true);

        try {
            const newNote = await fractalApi.createNote(rootId, {
                content: newNoteContent.trim(),
                entity_type: entityType,
                entity_id: entityId
            });

            setNotes(prev => [newNote, ...prev]);
            setNewNoteContent('');
        } catch (err) {
            console.error('Failed to add note:', err);
        } finally {
            setSubmitting(false);
        }
    };

    // Delete note
    const handleDeleteNote = async (noteId) => {
        if (!rootId) return;

        try {
            await fractalApi.deleteNote(rootId, noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error('Failed to delete note:', err);
        }
    };

    // Handle keyboard shortcut
    const handleKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            handleAddNote(e);
        }
    };

    // Group notes by entity for display
    const groupedNotes = React.useMemo(() => {
        const groups = { direct: [], children: {} };

        notes.forEach(note => {
            if (note.entity_type === entityType && note.entity_id === entityId) {
                groups.direct.push(note);
            } else {
                const key = note.entity_context?.activity_name ||
                    note.entity_context?.session_name ||
                    note.entity_context?.goal_name ||
                    note.entity_type;
                if (!groups.children[key]) {
                    groups.children[key] = [];
                }
                groups.children[key].push(note);
            }
        });

        return groups;
    }, [notes, entityType, entityId]);

    // No context available
    if (!activeContext) {
        return (
            <div className="notes-mode-empty">
                <p>Select an item to view notes</p>
            </div>
        );
    }

    return (
        <div className="notes-mode">
            {/* View Toggle */}
            <div className="notes-view-toggle">
                <button
                    className={viewMode === 'context' ? 'active' : ''}
                    onClick={() => setViewMode('context')}
                >
                    Context
                </button>
                <button
                    className={viewMode === 'feed' ? 'active' : ''}
                    onClick={() => setViewMode('feed')}
                >
                    Feed
                </button>
            </div>

            {/* Add Note Form */}
            {entityType && entityId && (
                <form className="note-editor" onSubmit={handleAddNote}>
                    <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Add note to ${activeContext.name}...`}
                        rows={3}
                        disabled={submitting}
                    />
                    <div className="note-editor-footer">
                        <span className="note-editor-hint">⌘ + Enter to submit</span>
                        <button
                            type="submit"
                            disabled={!newNoteContent.trim() || submitting}
                        >
                            {submitting ? 'Adding...' : 'Add Note'}
                        </button>
                    </div>
                </form>
            )}

            {/* Notes List */}
            <div className="notes-list">
                {loading ? (
                    <div className="notes-loading">Loading notes...</div>
                ) : error ? (
                    <div className="notes-error">{error}</div>
                ) : notes.length === 0 ? (
                    <div className="notes-empty">
                        <p>No notes yet</p>
                        <span>Add your first note above</span>
                    </div>
                ) : viewMode === 'context' ? (
                    <>
                        {/* Direct notes */}
                        {groupedNotes.direct.length > 0 && (
                            <div className="notes-group">
                                <div className="notes-group-header">
                                    {getEntityLabel(entityType)} Notes ({groupedNotes.direct.length})
                                </div>
                                {groupedNotes.direct.map(note => (
                                    <NoteCard
                                        key={note.id}
                                        note={note}
                                        onDelete={handleDeleteNote}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Child notes grouped */}
                        {Object.keys(groupedNotes.children).length > 0 && (
                            <div className="notes-children-section">
                                <div className="notes-section-divider">
                                    <span>Related Notes</span>
                                </div>
                                {Object.entries(groupedNotes.children).map(([key, notesGroup]) => (
                                    <CollapsibleGroup
                                        key={key}
                                        title={key}
                                        notes={notesGroup}
                                        onDelete={handleDeleteNote}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    // Feed view - flat list
                    notes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onDelete={handleDeleteNote}
                            showContext
                        />
                    ))
                )}
            </div>
        </div>
    );
};

// Helper: Note card component
const NoteCard = ({ note, onDelete, showContext = false }) => {
    const timeAgo = formatDistanceToNow(new Date(note.created_at), { addSuffix: true });

    return (
        <div className="note-card">
            <div className="note-card-header">
                <span className="note-card-time">{timeAgo}</span>
                {showContext && note.entity_context && (
                    <span className="note-card-context">
                        {note.entity_context.activity_name ||
                            note.entity_context.session_name ||
                            note.entity_context.goal_name}
                    </span>
                )}
                <button
                    className="note-card-delete"
                    onClick={() => onDelete(note.id)}
                    title="Delete note"
                >
                    🗑️
                </button>
            </div>
            <div className="note-card-content">
                {note.content}
            </div>
        </div>
    );
};

// Helper: Collapsible group
const CollapsibleGroup = ({ title, notes, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="notes-collapsible-group">
            <button
                className="notes-collapsible-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="notes-collapsible-icon">
                    {isExpanded ? '▼' : '▶'}
                </span>
                <span className="notes-collapsible-title">{title}</span>
                <span className="notes-collapsible-count">({notes.length})</span>
            </button>

            {isExpanded && (
                <div className="notes-collapsible-content">
                    {notes.map(note => (
                        <NoteCard key={note.id} note={note} onDelete={onDelete} />
                    ))}
                </div>
            )}
        </div>
    );
};

// Helper: Get entity label
function getEntityLabel(entityType) {
    const labels = {
        goal: 'Goal',
        session: 'Session',
        activity_instance: 'Activity',
        program: 'Program',
        program_day: 'Day'
    };
    return labels[entityType] || 'Entity';
}

export default NotesMode;
