/**
 * NoteTimeline — shared timeline component.
 * Groups notes by date, shows date headers, supports pagination and empty states.
 * Used on /notes page, goal detail modal, and session detail.
 */

import React from 'react';
import NoteCard from './NoteCard';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import { useTimezone } from '../../contexts/TimezoneContext';
import styles from './NoteTimeline.module.css';

function groupNotesByDate(notes, timezone) {
    const groups = [];
    let currentDate = null;
    let currentGroup = null;

    for (const note of notes) {
        const dateLabel = formatDateLabel(note.created_at, timezone);
        if (dateLabel !== currentDate) {
            currentDate = dateLabel;
            currentGroup = { date: dateLabel, notes: [] };
            groups.push(currentGroup);
        }
        currentGroup.notes.push(note);
    }
    return groups;
}

function formatDateLabel(isoString, timezone) {
    if (!isoString) return 'Unknown date';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { timeZone: timezone });
        const dateStr = date.toLocaleDateString('en-US', { timeZone: timezone });
        const calendarLabel = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: timezone,
        });

        if (dateStr === todayStr) return `Today · ${calendarLabel}`;

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-US', { timeZone: timezone });
        if (dateStr === yesterdayStr) return `Yesterday · ${calendarLabel}`;

        return calendarLabel;
    } catch {
        return 'Unknown date';
    }
}

function groupNotesBySession(notes) {
    const groups = [];

    for (const note of notes) {
        const sessionId = note.session_id || null;
        const previous = groups[groups.length - 1];
        if (sessionId && previous?.sessionId === sessionId) {
            previous.notes.push(note);
        } else {
            groups.push({
                sessionId,
                notes: [note],
                sessionName: note.session_template_name || note.session_name || 'Session',
                sessionColor: note.session_template_color || note.template_color,
            });
        }
    }

    return groups;
}

function NoteTimeline({
    notes = [],
    onEdit,
    onEditRequest,
    onDelete,
    onPin,
    onUnpin,
    showContext = false,
    compact = false,
    minimal = false,
    variant = 'card', // 'card' (filled) or 'flat' (transparent, for session detail)
    presentation = 'cards',
    showTypePill = true,
    noteTypeVariant = 'pill',
    selectedNoteId,
    onNoteSelect,
    hasMore = false,
    onLoadMore,
    emptyMessage = 'No notes yet.',
    groupByDate = true,
}) {
    const { timezone } = useTimezone();

    if (!notes.length) {
        return <div className={styles.emptyState}>{emptyMessage}</div>;
    }

    const pinnedNotes = notes.filter(n => n.is_pinned);
    const unpinnedNotes = notes.filter(n => !n.is_pinned);

    const renderNote = (note, suppressSessionContext = false) => (
        <NoteCard
            key={note.id}
            note={note}
            onEdit={onEdit}
            onEditRequest={onEditRequest}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
            showContext={showContext}
            compact={compact}
            minimal={minimal}
            variant={presentation === 'timeline' ? 'timeline' : variant}
            compactMedia={presentation === 'timeline'}
            suppressSessionContext={suppressSessionContext}
            timestampDisplay={presentation === 'timeline' && groupByDate ? 'time' : 'dateTime'}
            showTypePill={showTypePill}
            noteTypeVariant={noteTypeVariant}
            isSelected={selectedNoteId === note.id}
            onSelect={() => onNoteSelect && onNoteSelect(note)}
        />
    );

    if (!groupByDate) {
        return (
            <div className={styles.timeline}>
                {pinnedNotes.map(note => renderNote(note))}
                {unpinnedNotes.map(note => renderNote(note))}
                {hasMore && (
                    <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
                )}
            </div>
        );
    }

    const groups = groupNotesByDate(unpinnedNotes, timezone);
    const isTimeline = presentation === 'timeline';

    const renderDateNotes = (dateNotes) => {
        if (!isTimeline) return dateNotes.map(note => renderNote(note));

        return groupNotesBySession(dateNotes).map((sessionGroup, index) => (
            sessionGroup.sessionId ? (
                <section
                    key={`session-${sessionGroup.sessionId}-${index}`}
                    className={styles.sessionGroup}
                    aria-label={`${sessionGroup.sessionName} session notes`}
                >
                    <div className={styles.sessionHeader}>
                        <span className={styles.sessionMarker} aria-hidden="true" />
                        <SessionTemplateNameBadge
                            name={sessionGroup.sessionName}
                            color={sessionGroup.sessionColor}
                            size="feed"
                            wrap
                            className={styles.sessionBadge}
                        />
                        <span className={styles.sessionCount}>
                            {sessionGroup.notes.length} {sessionGroup.notes.length === 1 ? 'note' : 'notes'}
                        </span>
                    </div>
                    <div className={styles.sessionNotes}>
                        {sessionGroup.notes.map(note => renderNote(note, true))}
                    </div>
                </section>
            ) : (
                <div key={`standalone-${sessionGroup.notes[0].id}`} className={styles.standaloneNote}>
                    {renderNote(sessionGroup.notes[0])}
                </div>
            )
        ));
    };

    return (
        <div className={`${styles.timeline} ${isTimeline ? styles.continuousTimeline : ''}`}>
            {/* Pinned section */}
            {pinnedNotes.length > 0 && (
                <div className={styles.pinnedSection}>
                    <div className={styles.sectionHeader}>Pinned</div>
                    {pinnedNotes.map(note => renderNote(note))}
                </div>
            )}

            {/* Date-grouped unpinned notes */}
            {groups.map(group => (
                <div key={group.date} className={styles.dateGroup}>
                    <div className={styles.dateHeader}>{group.date}</div>
                    <div className={isTimeline ? styles.dateNotes : undefined}>{renderDateNotes(group.notes)}</div>
                </div>
            ))}

            {hasMore && (
                <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
            )}
        </div>
    );
}

export default NoteTimeline;
