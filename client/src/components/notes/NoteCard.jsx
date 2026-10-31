/** Shared note card for note feeds, goal details, and session details. */
import React, { useState, useRef, useEffect } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { PinIcon } from '../atoms/AppIcons';
import CheckIcon from '../atoms/CheckIcon';
import CloseIcon from '../atoms/CloseIcon';
import GoalIcon from '../atoms/GoalIcon';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import NoteMedia from './NoteMedia';
import NoteOptionsMenu from './NoteOptionsMenu';
import MarkdownNoteContent from './MarkdownNoteContent';
import styles from './NoteCard.module.css';
import { GOAL_NOTE_TYPES, NOTE_KIND_LABELS, NOTE_TYPE_LABELS } from '../../utils/noteTypes';
function buildPlainTextPreview(content) {
    if (!content) return '';
    return content
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_>#~-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function deriveNoteType(note) {
    if (note.note_type) {
        return note.note_type;
    }
    if (note.context_type === 'root') return 'fractal_note';
    if (note.context_type === 'goal') return 'goal_note';
    if (note.context_type === 'session') return 'session_note';
    if (note.context_type === 'program') return 'program_note';
    if (note.context_type === 'activity_definition') return 'activity_definition_note';
    if (note.context_type === 'activity_instance') {
        return note.set_index !== null && note.set_index !== undefined
            ? 'activity_set_note'
            : 'activity_instance_note';
    }
    if (note.context_type?.startsWith('circuit_')) return `${note.context_type}_note`;
    return 'note';
}

function deriveNoteTypeLabel(note) {
    if (note.note_type_label) {
        return note.note_type_label;
    }
    return NOTE_TYPE_LABELS[deriveNoteType(note)] || 'Note';
}

function formatMetadataNoteTypeLabel(label) {
    return label.replace(/\s+Note$/i, '');
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
    compactMedia = false,
    suppressSessionContext = false,
    timestampDisplay = 'dateTime',
    showTypePill = true,
    noteTypeVariant = 'pill',
    isSelected = false,
    onSelect,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(note.content);
    const [isDeleting, setIsDeleting] = useState(false);
    const [managingMedia, setManagingMedia] = useState(false);
    const textareaRef = useRef(null);
    const cardRef = useRef(null);
    const { timezone } = useTimezone();
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const resolvedNoteType = deriveNoteType(note);
    const resolvedNoteTypeLabel = deriveNoteTypeLabel(note);
    const isGoalCompletionNote = resolvedNoteType === 'goal_completion_note';
    const noteKindLabel = NOTE_KIND_LABELS[note.note_kind]
        || (isGoalCompletionNote ? NOTE_KIND_LABELS.goal_completion : null);
    const displayNoteTypeLabel = noteTypeVariant === 'metadata'
        ? formatMetadataNoteTypeLabel(resolvedNoteTypeLabel)
        : resolvedNoteTypeLabel;
    // All note surfaces now render rich content (markdown + inline video embeds).
    const supportsMarkdown = true;
    const setLabel = resolvedNoteType === 'activity_set_note' && note.set_index != null
        ? `Set #${note.set_index + 1}`
        : null;
    const sessionTemplateName = note.session_template_name || note.session_name || 'Session';
    const sessionTemplateColor = note.session_template_color || note.template_color;
    const renderSessionTemplateBadge = (className = styles.sessionTemplateBadge) => (
        <SessionTemplateNameBadge
            name={sessionTemplateName}
            color={sessionTemplateColor}
            size="feed"
            className={className}
        />
    );

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
            if (timestampDisplay === 'time') return timeStr;
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
        if (note.is_pinned) {
            onUnpin && onUnpin(note.id);
        } else {
            onPin && onPin(note.id);
        }
    };

    const handleEditClick = (e) => {
        e.stopPropagation();
        if (onEditRequest) {
            onEditRequest(note);
        } else {
            setIsEditing(true);
        }
    };

    const canEdit = (!!onEdit || !!onEditRequest) && !note.isPast;
    const canPin = (!!onPin || !!onUnpin) && !note.isPast && resolvedNoteType !== 'activity_set_note';
    const canDelete = !!onDelete && !note.isPast;
    const canManageMedia = canEdit && Boolean(note.root_id);
    const menuItems = [
        canEdit && { label: 'Edit', onSelect: handleEditClick },
        canManageMedia && { label: note.attachments?.length ? 'Manage attachments' : 'Attach pictures, video or audio', onSelect: () => setManagingMedia(true) },
        canPin && { label: note.is_pinned ? 'Unpin' : 'Pin note', onSelect: handlePinToggle },
        canDelete && { label: 'Delete', onSelect: handleDelete, danger: true },
    ].filter(Boolean);
    const shouldDeferRichContent = !note.is_pinned && !isSelected && !minimal && !compact;
    const [shouldRenderRichContent, setShouldRenderRichContent] = useState(
        typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined' || !shouldDeferRichContent
    );
    const shouldShowRichContent = !shouldDeferRichContent || shouldRenderRichContent || managingMedia;
    const previewContent = supportsMarkdown ? buildPlainTextPreview(note.content) : note.content;
    const timestamp = (
        <span className={styles.timestamp}>
            {formatDate(note.created_at)}
            {note.isPast && note.session_name && resolvedNoteType !== 'session_note' && (
                <span className={styles.pastSessionName}>{renderSessionTemplateBadge(styles.pastSessionBadge)}</span>
            )}
        </span>
    );

    useEffect(() => {
        if (!shouldDeferRichContent) {
            return;
        }

        if (shouldShowRichContent || !cardRef.current) {
            return;
        }

        const observer = new window.IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShouldRenderRichContent(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '600px 0px' }
        );

        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [shouldDeferRichContent, shouldShowRichContent]);

    const primaryContextLabel = note.context_display_name || (() => {
        switch (resolvedNoteType) {
            case 'fractal_note':
                return 'Fractal';
            case 'goal_note':
                return note.goal_name || note.content || 'Goal';
            case 'goal_completion_note':
            case 'goal_review_note':
                return note.goal_name || note.content || 'Goal';
            case 'session_note':
                return suppressSessionContext
                    ? 'Session note'
                    : note.session_template_name || note.session_name || 'Session';
            case 'program_note':
                return note.program_name || 'Program';
            case 'activity_set_note':
                return `${note.activity_definition_name || 'Activity'} · Set ${(note.set_index ?? 0) + 1}`;
            case 'activity_instance_note':
            case 'activity_definition_note':
                return note.activity_definition_name || 'Activity';
            case 'circuit_run_note': return 'Activity circuit';
            case 'circuit_round_note': return 'Circuit round';
            default:
                return 'Note';
        }
    })();
    const secondaryContextBadges = [];
    if (showContext && resolvedNoteType !== 'fractal_note') {
        if (!GOAL_NOTE_TYPES.has(resolvedNoteType) && note.goal_name) {
            secondaryContextBadges.push({ type: 'text', label: note.goal_name });
        }
        if (resolvedNoteType !== 'activity_instance_note' && resolvedNoteType !== 'activity_definition_note' && resolvedNoteType !== 'activity_set_note' && note.activity_definition_name) {
            secondaryContextBadges.push({ type: 'text', label: note.activity_definition_name });
        }
        if (!suppressSessionContext && resolvedNoteType !== 'session_note' && note.session_name) {
            secondaryContextBadges.push({
                type: 'session',
                label: note.session_template_name || note.session_name,
                color: note.session_template_color || note.template_color,
            });
        }
        if (!secondaryContextBadges.length && note.context_type === 'root') {
            secondaryContextBadges.push({ type: 'text', label: 'Fractal' });
        }
    }

    if (isDeleting) {
        return <div className={`${styles.noteCard} ${styles.noteCardDeleting}`}>Deleting…</div>;
    }

    return (
        <>
            <div
                ref={cardRef}
                className={[
                    styles.noteCard,
                    variant === 'flat' ? styles.flat : '',
                    variant === 'timeline' ? styles.timeline : '',
                    compact ? styles.compact : '',
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
                    <span className={styles.pinnedIndicator} title="Pinned">
                        <PinIcon size={14} />
                    </span>
                )}

                {/* Options button — pinned to the card's top-right corner */}
                {menuItems.length > 0 && <NoteOptionsMenu items={menuItems} />}

                {/* Top row: timestamp + badges */}
                <div className={styles.topRow}>
                    {!minimal && (
                        <div className={styles.metaStack}>
                            <div className={styles.metaRow}>
                                <div className={styles.contextSummary}>
                                    {(resolvedNoteType === 'goal_note' || isGoalCompletionNote) && note.goal_type ? (
                                        <span className={styles.goalContext}>
                                            {isGoalCompletionNote ? (
                                                <>
                                                    <span className={styles.noteKindPrefix}>{noteKindLabel}:</span>
                                                    <GoalIcon
                                                        shape={getGoalIcon(note.goal_type)}
                                                        color={getGoalColor('Completed')}
                                                        secondaryColor={getGoalSecondaryColor('Completed')}
                                                        isSmart={Boolean(note.goal_is_smart)}
                                                        size={12}
                                                    />
                                                    <span className={styles.contextPrimary}>{primaryContextLabel}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className={styles.contextPrimary}>{primaryContextLabel}</span>
                                                    <GoalIcon
                                                        shape={getGoalIcon(note.goal_type)}
                                                        color={getGoalColor(note.goal_type)}
                                                        secondaryColor={getGoalSecondaryColor(note.goal_type)}
                                                        isSmart={Boolean(note.goal_is_smart)}
                                                        size={12}
                                                    />
                                                </>
                                            )}
                                        </span>
                                    ) : resolvedNoteType === 'session_note' && suppressSessionContext ? (
                                        null  // The session group's header already names the session.
                                    ) : resolvedNoteType === 'session_note' ? (
                                        renderSessionTemplateBadge()
                                    ) : (
                                        <span className={styles.contextPrimary}>{primaryContextLabel}</span>
                                    )}
                                </div>
                            </div>
                            {secondaryContextBadges.length > 0 && (
                                <div className={styles.contextBadges}>
                                    {secondaryContextBadges.map((badge, index) => (
                                        badge.type === 'session' ? (
                                            <SessionTemplateNameBadge
                                                key={`${badge.label}-${index}`}
                                                name={badge.label}
                                                color={badge.color}
                                                size="feed"
                                                className={styles.sessionTemplateBadge}
                                            />
                                        ) : (
                                            <span key={`${badge.label}-${index}`} className={styles.contextBadge}>{badge.label}</span>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.headerActions}>
                        {!minimal && noteTypeVariant === 'metadata' && (
                            <>
                                {showTypePill && !noteKindLabel && !suppressSessionContext && (
                                    <>
                                        <span className={styles.noteTypeText}>{displayNoteTypeLabel}</span>
                                        <span className={styles.metaSep} aria-hidden="true">·</span>
                                    </>
                                )}
                                {timestamp}
                            </>
                        )}
                        {!minimal && noteTypeVariant !== 'metadata' && (
                            <>
                                {showTypePill && !noteKindLabel && (
                                    <span className={styles.noteTypePill}>
                                        {displayNoteTypeLabel}
                                    </span>
                                )}
                                {timestamp}
                            </>
                        )}
                        {minimal && (
                            <>
                                {setLabel && (
                                    <span className={styles.setLabel}>{setLabel}</span>
                                )}
                                {timestamp}
                            </>
                        )}
                    </div>
                </div>
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
                            <button onClick={handleSave} className={styles.saveBtn} aria-label="Save note">
                                <CheckIcon size={14} />
                            </button>
                            <button
                                onClick={() => { setEditContent(note.content); setIsEditing(false); }}
                                className={styles.cancelBtn}
                                aria-label="Cancel editing"
                            >
                                <CloseIcon size={14} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.content}>
                        {shouldShowRichContent ? (
                            <MarkdownNoteContent
                                content={note.content}
                                className={styles.markdownContent}
                                compactMedia={compactMedia}
                            />
                        ) : (
                            <div className={`${styles.markdownContent} ${styles.previewContent}`}>
                                {previewContent || ' '}
                            </div>
                        )}
                    </div>
                )}
                {shouldShowRichContent && (
                    <NoteMedia note={note} managing={managingMedia} onDoneManaging={() => setManagingMedia(false)} />
                )}
            </div>
        </>
    );
}

export default NoteCard;
