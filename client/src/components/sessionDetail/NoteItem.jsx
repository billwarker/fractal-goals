/**
 * NoteItem - Single note with edit/delete functionality
 */

import React, { useState } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';

function NoteItem({ note, onUpdate, onDelete, compact = false }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(note.content);
    const [isDeleting, setIsDeleting] = useState(false);
    const timezone = useTimezone();

    // Format timestamp
    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone
            });
        } catch (e) {
            return '';
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();

            if (isToday) {
                return formatTime(isoString);
            }

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: timezone
            }) + ' ' + formatTime(isoString);
        } catch (e) {
            return '';
        }
    };

    const handleSave = async () => {
        if (!editContent.trim()) return;

        try {
            await onUpdate(note.id, editContent.trim());
            setIsEditing(false);
        } catch (err) {
            // Keep in edit mode on error
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(note.id);
        } catch (err) {
            setIsDeleting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setEditContent(note.content);
            setIsEditing(false);
        }
    };

    if (isDeleting) {
        return (
            <div className="note-item note-item-deleting">
                Deleting...
            </div>
        );
    }

    return (
        <div className={`note-item ${compact ? 'compact' : ''}`}>
            <div className="note-item-time">
                {formatDate(note.created_at)}
                {note.set_index !== null && note.set_index !== undefined && (
                    <span className="note-item-set-badge">Set {note.set_index + 1}</span>
                )}
            </div>

            {isEditing ? (
                <div className="note-item-edit">
                    <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="note-edit-input"
                        autoFocus
                    />
                    <div className="note-edit-actions">
                        <button onClick={handleSave} className="note-save-btn">✓</button>
                        <button onClick={() => {
                            setEditContent(note.content);
                            setIsEditing(false);
                        }} className="note-cancel-btn">✕</button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="note-item-content">
                        {note.content}
                    </div>
                    {!compact && (
                        <div className="note-item-actions">
                            <button
                                onClick={() => setIsEditing(true)}
                                className="note-action-btn"
                                title="Edit"
                            >
                                ✏️
                            </button>
                            <button
                                onClick={handleDelete}
                                className="note-action-btn note-delete-btn"
                                title="Delete"
                            >
                                🗑️
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default NoteItem;
