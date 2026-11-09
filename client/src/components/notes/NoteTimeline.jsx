/**
 * NoteTimeline — shared timeline component.
 * Groups notes by date, shows date headers, supports pagination and empty states.
 * Used on /notes page, goal detail modal, and session detail.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import GoalIcon from '../atoms/GoalIcon';
import { LightningIcon, TimerIcon } from '../analytics/AnalyticsIcons';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import NoteCard from './NoteCard';
import NoteContextLine from './NoteContextLine';
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
                rootId: note.root_id,
            });
        }
    }

    return groups;
}

/** Runs of consecutive notes written on the same activity instance; other notes stand alone. */
export function groupNotesByInstance(notes) {
    const groups = [];
    for (const note of notes) {
        const instanceId = note.activity_instance_id || null;
        const previous = groups[groups.length - 1];
        if (instanceId && previous?.instanceId === instanceId) previous.notes.push(note);
        else groups.push({ instanceId, notes: [note] });
    }
    return groups;
}

/**
 * A directory-style node on a timeline line, using the Analytics category icons: a session on the rail,
 * an activity on its session's line, a goal note on the rail. Labels sit one grid unit to its right.
 */
function TreeNode({ kind, children, color }) {
    return (
        <span
            className={`${styles.treeNode} ${styles[`${kind}Node`]}`}
            style={color ? { '--node-color': color } : undefined}
            aria-hidden="true"
        >
            {children}
        </span>
    );
}

/** An activity branching off its session: a lightning node on the session's line. */
function ActivityBranch({ grouped = false, children }) {
    return (
        <div className={`${styles.activityBranch} ${grouped ? styles.groupedBranch : ''}`}>
            <TreeNode kind="activity"><LightningIcon size={12} /></TreeNode>
            {children}
        </div>
    );
}

/**
 * Several notes written on one activity instance: one header names the activity and leads to it,
 * and the notes beneath keep only their time, set and text.
 */
function ActivityNoteGroup({ notes, renderNote }) {
    const [first] = notes;
    const name = first.activity_definition_name || 'Activity';
    return (
        <section className={styles.activityGroup} aria-label={`${name} notes`}>
            <div className={styles.activityHeader}>
                <span className={styles.activityName}>{name}</span>
                <span className={styles.sessionCount}>{notes.length} notes</span>
            </div>
            {/* The instance's values, no single note's set marked; the session header links the session. */}
            <NoteContextLine note={{ ...first, activity_set_id: null, set_metrics: null }} hideLink />
            <div className={styles.activityNotes}>{notes.map(renderNote)}</div>
        </section>
    );
}

function NoteTimeline({
    notes = [],
    onEdit,
    onEditRequest,
    onDelete,
    onCarryForward,
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
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    if (!notes.length) {
        return <div className={styles.emptyState}>{emptyMessage}</div>;
    }

    const renderNote = (note, suppressSessionContext = false, suppressActivityContext = false) => (
        <NoteCard
            key={note.id}
            note={note}
            onEdit={onEdit}
            onEditRequest={onEditRequest}
            onDelete={onDelete}
            onCarryForward={onCarryForward}
            showContext={showContext}
            compact={compact}
            minimal={minimal}
            variant={presentation === 'timeline' ? 'timeline' : variant}
            compactMedia={presentation === 'timeline'}
            suppressSessionContext={suppressSessionContext}
            suppressActivityContext={suppressActivityContext}
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
                {notes.map(note => renderNote(note))}
                {hasMore && (
                    <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
                )}
            </div>
        );
    }

    const groups = groupNotesByDate(notes, timezone);
    const isTimeline = presentation === 'timeline';
    // A note outside any session hangs off the rail on its kind's icon: its goal's, or an activity's.
    const standaloneNode = (note) => {
        if (note.goal_type && note.context_type === 'goal') {
            return (
                <TreeNode kind="goal" color={getGoalColor(note.goal_type)}>
                    <GoalIcon
                        shape={getGoalIcon(note.goal_type)}
                        color={getGoalColor(note.goal_type)}
                        secondaryColor={getGoalSecondaryColor(note.goal_type)}
                        size={12}
                    />
                </TreeNode>
            );
        }
        if (note.activity_definition_id) return <TreeNode kind="goal"><LightningIcon size={12} /></TreeNode>;
        return null;
    };

    const renderDateNotes = (dateNotes) => {
        if (!isTimeline) return dateNotes.map(note => renderNote(note));

        return groupNotesBySession(dateNotes).map((sessionGroup, index) => (
            sessionGroup.sessionId ? (
                <section
                    key={`session-${sessionGroup.sessionId}-${index}`}
                    className={styles.sessionGroup}
                    style={sessionGroup.sessionColor ? { '--session-color': sessionGroup.sessionColor } : undefined}
                    aria-label={`${sessionGroup.sessionName} session notes`}
                >
                    <div className={styles.sessionHeader}>
                        <TreeNode kind="session"><TimerIcon size={12} /></TreeNode>
                        <SessionTemplateNameBadge
                            name={sessionGroup.sessionName}
                            color={sessionGroup.sessionColor}
                            size="feed"
                            wrap
                            className={styles.sessionBadge}
                        />
                        {sessionGroup.rootId ? (
                            <Link className={styles.sessionLink} to={`/${sessionGroup.rootId}/session/${sessionGroup.sessionId}`}>
                                Open session
                            </Link>
                        ) : null}
                        <span className={styles.sessionCount}>
                            {sessionGroup.notes.length} {sessionGroup.notes.length === 1 ? 'note' : 'notes'}
                        </span>
                    </div>
                    <div className={styles.sessionNotes}>
                        {groupNotesByInstance(sessionGroup.notes).map((instanceGroup) => {
                            const [first] = instanceGroup.notes;
                            if (!instanceGroup.instanceId) return renderNote(first, true);
                            return (
                                <ActivityBranch
                                    key={`instance-${instanceGroup.instanceId}-${first.id}`}
                                    grouped={instanceGroup.notes.length > 1}
                                >
                                    {instanceGroup.notes.length > 1 ? (
                                        <ActivityNoteGroup
                                            notes={instanceGroup.notes}
                                            renderNote={(note) => renderNote(note, true, true)}
                                        />
                                    ) : renderNote(first, true)}
                                </ActivityBranch>
                            );
                        })}
                    </div>
                </section>
            ) : (
                <div
                    key={`standalone-${sessionGroup.notes[0].id}`}
                    className={`${styles.standaloneNote} ${standaloneNode(sessionGroup.notes[0]) ? styles.withNode : ''}`}
                >
                    {standaloneNode(sessionGroup.notes[0])}
                    {renderNote(sessionGroup.notes[0])}
                </div>
            )
        ));
    };

    return (
        <div className={`${styles.timeline} ${isTimeline ? styles.continuousTimeline : ''}`}>
            {/* Date-grouped notes; the timeline presentation draws one rail through them. */}
            <div className={isTimeline ? styles.rail : undefined}>
                {groups.map(group => (
                    <div key={group.date} className={styles.dateGroup}>
                        <div className={styles.dateHeader}>{group.date}</div>
                        <div className={isTimeline ? styles.dateNotes : undefined}>{renderDateNotes(group.notes)}</div>
                    </div>
                ))}
            </div>

            {hasMore && (
                <button className={styles.loadMoreBtn} onClick={onLoadMore}>Load more</button>
            )}
        </div>
    );
}

export default NoteTimeline;
