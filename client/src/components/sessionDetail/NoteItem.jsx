/**
 * NoteItem - Single note with edit/delete functionality and image support
 */

import React, { useState, useRef, useEffect } from 'react';
import Linkify from '../atoms/Linkify';
import { useTimezone } from '../../contexts/TimezoneContext';
import ImageViewerModal from './ImageViewerModal';
import styles from './NoteItem.module.css';

function NoteItem({ note, onUpdate, onDelete, compact = false, isSelected, onSelect }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(note.content);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const { timezone } = useTimezone();
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
            <div className={`${styles.noteItem} ${styles.noteItemDeleting}`}>
                Deleting...
            </div>
        );
    }

    const highlightStyle = isSelected ? styles.highlightSelected : '';
    const pastStyle = note.isPast ? styles.pastNoteItem : '';

    return (
        <>
            <div
                className={`${styles.noteItem} ${compact ? styles.compact : ''} ${hasImage ? styles.hasImage : ''} ${highlightStyle} ${pastStyle}`}
                onClick={handleClick}
            >
                {note.activityName && (
                    <div className={styles.activityBadgeContainer}>
                        <span className={styles.activityBadge}>
                            {note.activityName}
                        </span>
                    </div>
                )}

                {/* Nano Goal Badge */}
                {note.is_nano_goal && (
                    <div className={styles.nanoBadgeContainer}>
                        <span className={styles.nanoBadge}>
                            Nano Goal
                        </span>
                    </div>
                )}

                <div className={styles.noteItemTime}>
                    {note.set_index !== null && note.set_index !== undefined && (
                        <>
                            <span className={styles.noteItemSetBadge}>Set {note.set_index + 1}</span>
                            <span className={styles.setSeparator}>-</span>
                        </>
                    )}
                    <span className={styles.noteDate}>
                        {formatDate(note.created_at)}
                        {note.isPast && note.session_name && (
                            <span className={styles.pastSessionName}>
                                ({note.session_name})
                            </span>
                        )}
                    </span>
                </div>

                {/* Image display */}
                {hasImage && (
                    <div className={styles.noteImageWrapper} onClick={handleImageClick}>
                        <img
                            src={note.image_data}
                            alt="Note attachment"
                            className={styles.noteImageThumbnail}
                        />
                        <div className={styles.noteImageOverlay}>
                            <span>Click to view</span>
                        </div>
                    </div>
                )}

                {isEditing ? (
                    <div className={styles.noteItemEdit}>
                        <textarea
                            ref={textareaRef}
                            value={editContent}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            className={`${styles.noteEditInput} ${styles.editTextarea}`}
                            rows={1}
                        />
                        <div className={styles.noteEditActions}>
                            <button onClick={handleSave} className={styles.noteSaveBtn}>✓</button>
                            <button onClick={() => {
                                setEditContent(note.content);
                                setIsEditing(false);
                            }} className={styles.noteCancelBtn}>✕</button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Only show text content if it's not just the placeholder */}
                        {!isImageOnly && (
                            <div className={styles.noteItemContent}>
                                <Linkify>{note.content}</Linkify>
                            </div>
                        )}
                        {(onUpdate || onDelete) && !note.isPast && (
                            <div className={styles.noteItemActions}>
                                {onUpdate && !isImageOnly && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className={styles.noteActionBtn}
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        onClick={handleDelete}
                                        className={`${styles.noteActionBtn} ${styles.noteDeleteBtn}`}
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div >

            {/* Image Viewer Modal */}
            {
                showImageViewer && note.image_data && (
                    <ImageViewerModal
                        imageData={note.image_data}
                        onClose={() => setShowImageViewer(false)}
                    />
                )
            }
        </>
    );
}

export default NoteItem;
