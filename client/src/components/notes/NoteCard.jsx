/**
 * NoteCard — shared note component used across all surfaces (notes page, goal modal, session detail).
 * Renders markdown content, options menu (edit/pin/delete), context badges, and image support.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalIcon from '../atoms/GoalIcon';
import ImageViewerModal from '../sessionDetail/ImageViewerModal';
import MarkdownNoteContent from './MarkdownNoteContent';
import styles from './NoteCard.module.css';

function NoteCard({
    note,
    onEdit,
    onEditRequest,   // if provided, called instead of opening inline editor
    onDelete,
    onPin,
    onUnpin,
    onToggleNanoGoal,
    nanoToggleDisabled = false,
    showContext = false,
    compact = false,
    variant = 'card',
    isSelected = false,
    onSelect,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(note.content);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const textareaRef = useRef(null);
    const { timezone } = useTimezone();
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            adjustHeight(textareaRef.current);
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
            textareaRef.current.focus();
        }
    }, [isEditing]);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handleOutsideClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [menuOpen]);

    const formatDate = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            const timeStr = date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone,
            });
            if (isToday) return timeStr;
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: timezone,
            }) + ' · ' + timeStr;
        } catch {
            return '';
        }
    };

    const handleSave = async () => {
        if (!editContent.trim()) return;
        try {
            await onEdit(note.id, editContent.trim());
            setIsEditing(false);
        } catch {
            // keep editing
        }
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        setMenuOpen(false);
        setIsDeleting(true);
        try {
            await onDelete(note);
        } catch {
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

    const handlePinToggle = (e) => {
        e.stopPropagation();
        setMenuOpen(false);
        if (note.is_pinned) {
            onUnpin && onUnpin(note.id);
        } else {
            onPin && onPin(note.id);
        }
    };

    const handleEditClick = (e) => {
        e.stopPropagation();
        setMenuOpen(false);
        if (onEditRequest) {
            onEditRequest(note);
        } else {
            setIsEditing(true);
        }
    };

    const isImageOnly = note.content === '[Image]' && note.image_data;
    const hasImage = !!note.image_data;
    const canEdit = (!!onEdit || !!onEditRequest) && !isImageOnly && !note.isPast;
    const canPin = (!!onPin || !!onUnpin) && !note.isPast;
    const canDelete = !!onDelete && !note.isPast;
    const hasMenu = canEdit || canPin || canDelete;

    if (isDeleting) {
        return <div className={`${styles.noteCard} ${styles.noteCardDeleting}`}>Deleting…</div>;
    }

    return (
        <>
            <div
                className={[
                    styles.noteCard,
                    variant === 'flat' ? styles.flat : '',
                    compact ? styles.compact : '',
                    hasImage ? styles.hasImage : '',
                    isSelected ? styles.selected : '',
                    note.isPast ? styles.pastNote : '',
                    note.is_pinned ? styles.pinned : '',
                ].filter(Boolean).join(' ')}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect && onSelect();
                }}
            >
                {/* Pin indicator */}
                {note.is_pinned && (
                    <span className={styles.pinnedIndicator} title="Pinned">📌</span>
                )}

                {/* Top row: timestamp + badges + options */}
                <div className={styles.topRow}>
                    <div className={styles.metaRow}>
                        {note.set_index !== null && note.set_index !== undefined && (
                            <>
                                <span className={styles.setBadge}>Set {note.set_index + 1}</span>
                                <span className={styles.metaSep}>·</span>
                            </>
                        )}
                        <span className={styles.timestamp}>
                            {formatDate(note.created_at)}
                            {note.isPast && note.session_name && (
                                <span className={styles.pastSessionName}> ({note.session_name})</span>
                            )}
                        </span>
                        {note.is_nano_goal && (
                            <span className={styles.nanoBadge}>Nano Goal</span>
                        )}
                    </div>

                    {hasMenu && (
                        <div className={styles.optionsWrapper} ref={menuRef}>
                            <button
                                className={styles.optionsBtn}
                                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                                title="Options"
                                aria-label="Note options"
                            >
                                ···
                            </button>
                            {menuOpen && (
                                <div className={styles.optionsMenu}>
                                    {canEdit && (
                                        <button className={styles.optionsMenuItem} onClick={handleEditClick}>
                                            Edit
                                        </button>
                                    )}
                                    {canPin && (
                                        <button className={styles.optionsMenuItem} onClick={handlePinToggle}>
                                            {note.is_pinned ? 'Unpin' : 'Pin note'}
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button className={`${styles.optionsMenuItem} ${styles.optionsMenuItemDanger}`} onClick={handleDelete}>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Context badges */}
                {showContext && (
                    <div className={styles.contextBadges}>
                        {note.context_type === 'root' && (
                            <span className={styles.contextBadge}>Fractal</span>
                        )}
                        {note.goal_name && (
                            <span className={styles.contextBadge}>{note.goal_name}</span>
                        )}
                        {note.activity_definition_name && (
                            <span className={styles.contextBadge}>{note.activity_definition_name}</span>
                        )}
                        {note.session_name && (
                            <span className={styles.contextBadge}>{note.session_name}</span>
                        )}
                    </div>
                )}

                {/* Image */}
                {hasImage && (
                    <div
                        className={styles.imageWrapper}
                        onClick={(e) => { e.stopPropagation(); setShowImageViewer(true); }}
                    >
                        <img src={note.image_data} alt="Note attachment" className={styles.imageThumbnail} />
                        <div className={styles.imageOverlay}><span>Click to view</span></div>
                    </div>
                )}

                {/* Content */}
                {isEditing ? (
                    <div className={styles.editArea}>
                        <textarea
                            ref={textareaRef}
                            value={editContent}
                            onChange={(e) => { setEditContent(e.target.value); adjustHeight(e.target); }}
                            onKeyDown={handleKeyDown}
                            className={styles.editTextarea}
                            rows={1}
                        />
                        <div className={styles.editActions}>
                            <button onClick={handleSave} className={styles.saveBtn}>✓</button>
                            <button onClick={() => { setEditContent(note.content); setIsEditing(false); }} className={styles.cancelBtn}>✕</button>
                        </div>
                    </div>
                ) : (
                    !isImageOnly && (
                        <div className={[
                            styles.content,
                            note.is_nano_goal ? styles.nanoContent : '',
                            note.nano_goal_completed ? styles.completedContent : '',
                        ].filter(Boolean).join(' ')}>
                            {note.is_nano_goal && (
                                <div className={styles.nanoIcon}>
                                    <GoalIcon
                                        shape={getGoalIcon('NanoGoal')}
                                        color={note.nano_goal_completed ? getGoalColor('Completed') : getGoalColor('NanoGoal')}
                                        secondaryColor={note.nano_goal_completed ? getGoalSecondaryColor('Completed') : getGoalSecondaryColor('NanoGoal')}
                                        size={14}
                                    />
                                </div>
                            )}
                            <MarkdownNoteContent content={note.content} className={styles.markdownContent} />
                            {note.is_nano_goal && onToggleNanoGoal && (
                                <input
                                    type="checkbox"
                                    checked={note.nano_goal_completed || false}
                                    onChange={(e) => onToggleNanoGoal(note.nano_goal_id, e.target.checked)}
                                    className={styles.nanoCheckbox}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={nanoToggleDisabled}
                                    title={note.nano_goal_completed ? 'Mark incomplete' : 'Mark complete'}
                                />
                            )}
                        </div>
                    )
                )}
            </div>

            {showImageViewer && note.image_data && (
                <ImageViewerModal
                    imageData={note.image_data}
                    onClose={() => setShowImageViewer(false)}
                />
            )}
        </>
    );
}

export default NoteCard;
