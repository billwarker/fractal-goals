/** Shared note card for note feeds, goal details, and session details. */
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTimezone } from '../../contexts/TimezoneContext';
import CheckIcon from '../atoms/CheckIcon';
import CloseIcon from '../atoms/CloseIcon';
import GoalIcon from '../atoms/GoalIcon';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import NoteMedia from './NoteMedia';
import NoteOptionsMenu from './NoteOptionsMenu';
import MarkdownNoteContent from './MarkdownNoteContent';
import NoteContextLine from './NoteContextLine';
import PinBadge from './PinBadge';
import ReviewNoteBody from './ReviewNoteBody';
import { GoalNoteHeading, ProgramNoteHeading, noteContextLabel } from './NoteCardHeadings';
import styles from './NoteCard.module.css';
import { formatLiteralDate } from '../../utils/dateUtils';
import { noteContextLink } from '../../utils/noteContext';
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
    if (note.context_type === 'program_date') return 'program_date_note';
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

/** What a note's next-time pin waits for: the next session, or the next instance of its activity. */
function carryForwardTarget(note) {
    return note.context_type === 'session' ? 'session' : note.activity_definition_name || 'activity';
}

/** "Pinned to next Bench Press" / "Pinned to next session" while a next-time pin waits; "Carried to next …" once used. */
export function carryForwardLabel(note) {
    if (note.carry_forward === 'pending') return `Pinned to next ${carryForwardTarget(note)}`;
    if (note.carry_forward === 'delivered') return `Carried to next ${carryForwardTarget(note)}`;
    return null;
}

function formatMetadataNoteTypeLabel(label) {
    return label.replace(/\s+Note$/i, '');
}

function NoteCard({
    note,
    onEdit,
    onEditRequest,   // if provided, called instead of opening inline editor
    onEditReview,    // (note): edit a guided review's answers in its goal's review form
    onOpenGoal,      // (note): open a goal note's goal; its name becomes the way in
    onDelete,
    onCarryForward,  // (noteId, on): pin to the next instance of the note's activity, or the next session
    showContext = false,
    compact = false,
    minimal = false,
    variant = 'card',
    compactMedia = false,
    suppressSessionContext = false,
    suppressActivityContext = false,  // inside an activity group, whose header names the activity
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

    const handleEditClick = (e) => {
        e.stopPropagation();
        if (onEditRequest) {
            onEditRequest(note);
        } else {
            setIsEditing(true);
        }
    };

    // A carried note belongs to an earlier session: here it can only be unpinned.
    const canWrite = (!!onEdit || !!onEditRequest) && !note.isPast && !note.isCarried;
    // A guided review's text is derived from its answers; it is not edited as text.
    const canEdit = canWrite && !note.review_data;
    const canEditReview = !!onEditReview && !note.isPast && Boolean(note.review_data);
    // A guided review's header carries its goal and its status; the body only the answers.
    const isReviewHeader = Boolean(note.review_data) && !minimal;
    // On the timeline the goal's icon sits on the rail beside the note, so the heading leaves it out.
    const showHeaderGoalIcon = variant !== 'timeline';
    const opensGoal = Boolean(onOpenGoal && note.goal_id && note.context_type === 'goal');
    // In a feed, a program note's name leads to its program instead of a separate link.
    const programLink = showContext && !minimal && note.root_id
        && (resolvedNoteType === 'program_note' || resolvedNoteType === 'program_date_note')
        ? noteContextLink(note, note.root_id)
        : null;
    const canCarry = !!onCarryForward && !note.isPast && note.carry_forward !== 'delivered'
        && Boolean(note.activity_definition_id || note.context_type === 'session');
    const canDelete = !!onDelete && !note.isPast && !note.isCarried;
    const canManageMedia = canWrite && Boolean(note.root_id);
    const nextTarget = carryForwardTarget(note);
    const carryLabel = carryForwardLabel(note);
    const menuItems = [
        canEdit && { label: 'Edit', onSelect: handleEditClick },
        canEditReview && { label: 'Edit', onSelect: (event) => { event.stopPropagation(); onEditReview(note); } },
        canManageMedia && { label: note.attachments?.length ? 'Manage attachments' : 'Attach pictures, video or audio', onSelect: () => setManagingMedia(true) },
        canCarry && {
            label: note.carry_forward === 'pending' ? `Unpin from next ${nextTarget}` : `Pin to next ${nextTarget}`,
            onSelect: (event) => { event.stopPropagation(); onCarryForward(note.id, note.carry_forward !== 'pending'); },
        },
        canDelete && { label: 'Delete', onSelect: handleDelete, danger: true },
    ].filter(Boolean);
    const shouldDeferRichContent = !isSelected && !minimal && !compact;
    const [shouldRenderRichContent, setShouldRenderRichContent] = useState(
        typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined' || !shouldDeferRichContent
    );
    const shouldShowRichContent = !shouldDeferRichContent || shouldRenderRichContent || managingMedia;
    const previewContent = supportsMarkdown ? buildPlainTextPreview(note.content) : note.content;
    // A pinned note says so beside its menu, with the same pin mark everywhere; a note carried in from an
    // earlier session links back to it. The time always sits on its own line above the text.
    const carriedFrom = formatLiteralDate(note.session_date || note.created_at, { year: undefined }) || 'last time';
    const pinBadge = note.isCarried ? (
        <PinBadge>
            {note.carry_forward === 'delivered' ? 'Carried' : 'Pinned'} from{' '}
            {note.root_id && note.session_id ? (
                <Link to={`/${note.root_id}/session/${note.session_id}`}>{carriedFrom}</Link>
            ) : carriedFrom}
        </PinBadge>
    ) : carryLabel ? <PinBadge>{carryLabel}</PinBadge> : null;
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

    const primaryContextLabel = noteContextLabel(note, resolvedNoteType, { suppressSessionContext });
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
                ].filter(Boolean).join(' ')}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect && onSelect();
                }}
            >
                {/* Options button — pinned to the card's top-right corner */}
                {menuItems.length > 0 && <NoteOptionsMenu items={menuItems} />}

                {/* Top row: timestamp + badges */}
                <div className={styles.topRow}>
                    {!minimal && (
                        <div className={styles.metaStack}>
                            <div className={styles.metaRow}>
                                <div className={styles.contextSummary}>
                                    {isReviewHeader || ((resolvedNoteType === 'goal_note' || isGoalCompletionNote) && note.goal_type) ? (
                                        <GoalNoteHeading
                                            note={note}
                                            label={primaryContextLabel}
                                            kind={isReviewHeader ? 'review' : isGoalCompletionNote ? 'completion' : 'goal'}
                                            showIcon={showHeaderGoalIcon}
                                            onOpenGoal={opensGoal ? onOpenGoal : null}
                                        />
                                    ) : suppressActivityContext ? (
                                        // The group's header names the activity: only a set needs a heading here.
                                        setLabel ? <span className={styles.contextPrimary}>{setLabel}</span> : null
                                    ) : resolvedNoteType === 'session_note' && suppressSessionContext ? (
                                        // The group's header names the session; this says what kind of note it is.
                                        <span className={styles.contextPrimary}>Session note</span>
                                    ) : resolvedNoteType === 'session_note' ? (
                                        renderSessionTemplateBadge()
                                    ) : programLink ? (
                                        <ProgramNoteHeading note={note} to={programLink.to} />
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
                                    <span className={styles.noteTypeText}>{displayNoteTypeLabel}</span>
                                )}
                            </>
                        )}
                        {!minimal && noteTypeVariant !== 'metadata' && (
                            <>
                                {showTypePill && !noteKindLabel && (
                                    <span className={styles.noteTypePill}>
                                        {displayNoteTypeLabel}
                                    </span>
                                )}
                            </>
                        )}
                        {minimal && (
                            <>
                                {setLabel && (
                                    <span className={styles.setLabel}>{setLabel}</span>
                                )}
                            </>
                        )}
                        {pinBadge}
                    </div>
                </div>
                {showContext && !minimal && !isReviewHeader && (
                    <NoteContextLine note={note} grouped={suppressActivityContext} hideLink={suppressSessionContext || opensGoal || Boolean(programLink)} />
                )}
                {/* One place for when: the time (and any pin) sits directly above the text, on every note. */}
                <div className={styles.timeLine}>{timestamp}</div>
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
                    <div className={`${styles.content} ${note.isCarried ? styles.carriedContent : ''}`}>
                        {note.review_data ? (
                            <ReviewNoteBody review={note.review_data} showStatus={!isReviewHeader} />
                        ) : shouldShowRichContent ? (
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
