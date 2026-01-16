/**
 * NoteItem - Single note with edit/delete functionality and image support
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import ImageViewerModal from './ImageViewerModal';

function NoteItem({ note, onUpdate, onDelete, compact = false, isSelected, onSelect }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(note.content);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const timezone = useTimezone();
    const textareaRef = useRef(null);

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            adjustHeight(textareaRef.current);
            // Focus and move cursor to end
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
            textareaRef.current.focus();
        }
    }, [isEditing]);

    const handleChange = (e) => {
        setEditContent(e.target.value);
        adjustHeight(e.target);
    };

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

    const handleDelete = async (e) => {
        e.stopPropagation(); // Prevent selection when deleting
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

    const handleImageClick = (e) => {
        e.stopPropagation();
        if (note.image_data) {
            setShowImageViewer(true);
        }
    };

    // Check if this is an image-only note
    const isImageOnly = note.content === '[Image]' && note.image_data;
    const hasImage = !!note.image_data;

    // Debug logging
    // console.log(`NoteItem render: ${note.id}, selected=${isSelected}`);

    const handleClick = (e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
    };

    if (isDeleting) {
        return (
            <div className="note-item note-item-deleting">
                Deleting...
            </div>
        );
    }

    const highlightStyle = isSelected ? {
        background: 'rgba(33, 150, 243, 0.15)',
        borderLeft: '4px solid #2196f3',
        paddingLeft: '8px',
        borderRadius: '4px'
    } : {};

    return (
        <>
            <div
                className={`note-item ${compact ? 'compact' : ''} ${hasImage ? 'has-image' : ''}`}
                onClick={handleClick}
                style={highlightStyle}
            >
                {note.activityName && (
                    <div style={{ marginBottom: '4px' }}>
                        <span style={{
                            fontSize: '11px',
                            color: '#4caf50',
                            background: 'rgba(76, 175, 80, 0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '500'
                        }}>
                            {note.activityName}
                        </span>
                    </div>
                )}
                <div className="note-item-time">
                    {note.set_index !== null && note.set_index !== undefined && (
                        <>
                            <span className="note-item-set-badge">Set {note.set_index + 1}</span>
                            <span style={{ margin: '0 6px', color: '#666' }}>-</span>
                        </>
                    )}
                    <span className="note-date">{formatDate(note.created_at)}</span>
                </div>

                {/* Image display */}
                {hasImage && (
                    <div className="note-image-wrapper" onClick={handleImageClick}>
                        <img
                            src={note.image_data}
                            alt="Note attachment"
                            className="note-image-thumbnail"
                        />
                        <div className="note-image-overlay">
                            <span>Click to view</span>
                        </div>
                    </div>
                )}

                {isEditing ? (
                    <div className="note-item-edit">
                        <textarea
                            ref={textareaRef}
                            value={editContent}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            className="note-edit-input"
                            rows={1}
                            style={{
                                resize: 'none',
                                overflow: 'hidden',
                                minHeight: '32px',
                                lineHeight: '1.4'
                            }}
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
                        {/* Only show text content if it's not just the placeholder */}
                        {!isImageOnly && (
                            <div className="note-item-content">
                                {note.content}
                            </div>
                        )}
                        {(onUpdate || onDelete) && (
                            <div className="note-item-actions">
                                {onUpdate && !isImageOnly && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="note-action-btn"
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        onClick={handleDelete}
                                        className="note-action-btn note-delete-btn"
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Image Viewer Modal */}
            {showImageViewer && note.image_data && (
                <ImageViewerModal
                    imageData={note.image_data}
                    onClose={() => setShowImageViewer(false)}
                />
            )}
        </>
    );
}

export default NoteItem;
