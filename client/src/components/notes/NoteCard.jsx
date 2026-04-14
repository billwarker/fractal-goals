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

function deriveNoteType(note) {
    if (note.note_type) {
        return note.note_type;
    }
    if (note.context_type === 'root') return 'fractal_note';
    if (note.context_type === 'goal') return 'goal_note';
    if (note.context_type === 'session') return 'session_note';
    if (note.context_type === 'activity_definition') return 'activity_definition_note';
    if (note.context_type === 'activity_instance') {
        return note.set_index !== null && note.set_index !== undefined
            ? 'activity_set_note'
            : 'activity_instance_note';
    }
    return 'note';
}

function deriveNoteTypeLabel(note) {
    if (note.note_type_label) {
        return note.note_type_label;
    }
    const labels = {
        fractal_note: 'Fractal Note',
        goal_note: 'Goal Note',
        session_note: 'Session Note',
        activity_instance_note: 'Activity Instance Note',
        activity_set_note: 'Activity Set Note',
        activity_definition_note: 'Activity Definition Note',
        note: 'Note',
    };
    return labels[deriveNoteType(note)] || 'Note';
}

function NoteCard({
    note,
    onEdit,
    onEditRequest,   // if provided, called instead of opening inline editor
    onDelete,
    onPin,
    onUnpin,
    showContext = false,
    compact = false,
    minimal = false,
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
    const resolvedNoteType = deriveNoteType(note);
    const resolvedNoteTypeLabel = deriveNoteTypeLabel(note);

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
    const canPin = (!!onPin || !!onUnpin) && !note.isPast && resolvedNoteType !== 'activity_set_note';
    const canDelete = !!onDelete && !note.isPast;
    const hasMenu = canEdit || canPin || canDelete;

    const primaryContextLabel = (() => {
        switch (resolvedNoteType) {
            case 'fractal_note':
                return 'Fractal';
            case 'goal_note':
                return note.goal_name || note.content || 'Goal';
            case 'session_note':
                return note.session_template_name || note.session_name || 'Session';
            case 'activity_set_note':
                return `${note.activity_definition_name || 'Activity'} · Set ${(note.set_index ?? 0) + 1}`;
            case 'activity_instance_note':
            case 'activity_definition_note':
                return note.activity_definition_name || 'Activity';
            default:
                return 'Note';
        }
    })();

    const secondaryContextBadges = [];
    if (showContext && resolvedNoteType !== 'fractal_note') {
        if (resolvedNoteType !== 'goal_note' && note.goal_name) {
            secondaryContextBadges.push(note.goal_name);
        }
        if (resolvedNoteType !== 'activity_instance_note' && resolvedNoteType !== 'activity_definition_note' && resolvedNoteType !== 'activity_set_note' && note.activity_definition_name) {
            secondaryContextBadges.push(note.activity_definition_name);
        }
        if (resolvedNoteType !== 'session_note' && note.session_name) {
            secondaryContextBadges.push(note.session_name);
        }
        if (!secondaryContextBadges.length && note.context_type === 'root') {
            secondaryContextBadges.push('Fractal');
        }
    }

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
                    {!minimal && (
                        <div className={styles.metaStack}>
                            <div className={styles.metaRow}>
                                <div className={styles.contextSummary}>
                                    {resolvedNoteType === 'goal_note' && note.goal_type ? (
                                        <span className={styles.goalContext}>
                                            <GoalIcon
                                                shape={getGoalIcon(note.goal_type)}
                                                color={getGoalColor(note.goal_type)}
                                                secondaryColor={getGoalSecondaryColor(note.goal_type)}
                                                isSmart={Boolean(note.goal_is_smart)}
                                                size={12}
                                            />
                                            <span className={styles.contextPrimary}>{primaryContextLabel}</span>
                                        </span>
                                    ) : (
                                        <span className={styles.contextPrimary}>{primaryContextLabel}</span>
                                    )}
                                </div>
                            </div>
                            {secondaryContextBadges.length > 0 && (
                                <div className={styles.contextBadges}>
                                    {secondaryContextBadges.map((badge, index) => (
                                        <span key={`${badge}-${index}`} className={styles.contextBadge}>{badge}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.headerActions}>
                        {!minimal && <span className={styles.noteTypePill}>{resolvedNoteTypeLabel}</span>}
                        <span className={styles.timestamp}>
                            {formatDate(note.created_at)}
                            {note.isPast && note.session_name && resolvedNoteType !== 'session_note' && (
                                <span className={styles.pastSessionName}> ({note.session_name})</span>
                            )}
                        </span>

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
                </div>

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
                        <div className={styles.content}>
                            <MarkdownNoteContent content={note.content} className={styles.markdownContent} />
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
