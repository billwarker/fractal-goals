/**
 * NoteTimeline — shared timeline component.
 * Groups notes by date, shows date headers, supports pagination and empty states.
 * Used on /notes page, goal detail modal, and session detail.
 */

import React from 'react';
import NoteCard from './NoteCard';
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

        if (dateStr === todayStr) return 'Today';

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-US', { timeZone: timezone });
        if (dateStr === yesterdayStr) return 'Yesterday';

        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
            timeZone: timezone,
        });
    } catch {
        return 'Unknown date';
    }
}

function NoteTimeline({
    notes = [],
    onEdit,
    onEditRequest,
    onDelete,
    onPin,
    onUnpin,
    onToggleNanoGoal,
    nanoToggleDisabled = false,
    showContext = false,
    compact = false,
    variant = 'card', // 'card' (filled) or 'flat' (transparent, for session detail)
    selectedNoteId,
    onNoteSelect,
    hasMore = false,
    onLoadMore,
    emptyMessage = 'No notes yet.',
    groupByDate = true,
    pendingNanoGoalIds,
}) {
    const { timezone } = useTimezone();

    if (!notes.length) {
        return <div className={styles.emptyState}>{emptyMessage}</div>;
    }

    const pinnedNotes = notes.filter(n => n.is_pinned);
    const unpinnedNotes = notes.filter(n => !n.is_pinned);

    const renderNote = (note) => (
        <NoteCard
            key={note.id}
            note={note}
            onEdit={onEdit}
            onEditRequest={onEditRequest}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
            onToggleNanoGoal={onToggleNanoGoal}
            nanoToggleDisabled={nanoToggleDisabled || (pendingNanoGoalIds && pendingNanoGoalIds.has(note.nano_goal_id))}
            showContext={showContext}
            compact={compact}
            variant={variant}
            isSelected={selectedNoteId === note.id}
            onSelect={() => onNoteSelect && onNoteSelect(note)}
        />
    );

    if (!groupByDate) {
        return (
            <div className={styles.timeline}>
                {notes.map(renderNote)}
                {hasMore && (
                    <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
                )}
            </div>
        );
    }

    const groups = groupNotesByDate(unpinnedNotes, timezone);

    return (
        <div className={styles.timeline}>
            {/* Pinned section */}
            {pinnedNotes.length > 0 && (
                <div className={styles.pinnedSection}>
                    <div className={styles.sectionHeader}>Pinned</div>
                    {pinnedNotes.map(renderNote)}
                </div>
            )}

            {/* Date-grouped unpinned notes */}
            {groups.map(group => (
                <div key={group.date} className={styles.dateGroup}>
                    <div className={styles.dateHeader}>{group.date}</div>
                    {group.notes.map(renderNote)}
                </div>
            ))}

            {hasMore && (
                <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
            )}
        </div>
    );
}

export default NoteTimeline;
