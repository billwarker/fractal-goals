/** The heading a note card opens with, by what the note was written on. */
import React from 'react';
import { Link } from 'react-router-dom';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalIcon from '../atoms/GoalIcon';
import { formatLiteralDate } from '../../utils/dateUtils';
import { NOTE_KIND_LABELS } from '../../utils/noteTypes';
import { ReviewStatusBadge } from './ReviewNoteBody';
import styles from './NoteCard.module.css';

/** What a note is about, in a few words: its goal, session, program and date, activity or set. */
export function noteContextLabel(note, noteType, { suppressSessionContext = false } = {}) {
    if (note.context_display_name) return note.context_display_name;
    switch (noteType) {
        case 'fractal_note': return 'Fractal';
        case 'goal_note':
        case 'goal_completion_note':
        case 'goal_review_note':
            return note.goal_name || note.content || 'Goal';
        case 'session_note':
            return suppressSessionContext ? 'Session note' : note.session_template_name || note.session_name || 'Session';
        case 'program_note': return note.program_name || 'Program';
        case 'program_date_note':
            return [note.program_name || 'Program', note.calendar_date && formatLiteralDate(note.calendar_date)].filter(Boolean).join(' · ');
        case 'activity_set_note': return `${note.activity_definition_name || 'Activity'} · Set ${(note.set_index ?? 0) + 1}`;
        case 'activity_instance_note':
        case 'activity_definition_note':
            return note.activity_definition_name || 'Activity';
        case 'circuit_run_note': return 'Activity circuit';
        case 'circuit_round_note': return 'Circuit round';
        default: return 'Note';
    }
}

/**
 * A goal note's heading: "Goal Review: [icon] name" with its status, "Goal Completion: [icon] name", or
 * "name [icon]". On the timeline the rail carries the icon, so `showIcon` is off; with `onOpenGoal` the name
 * opens the goal.
 */
export function GoalNoteHeading({ note, label, kind, showIcon, onOpenGoal }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const level = kind === 'completion' ? 'Completed' : note.goal_type;
    const icon = showIcon && note.goal_type ? (
        <GoalIcon
            shape={getGoalIcon(note.goal_type)}
            color={getGoalColor(level)}
            secondaryColor={getGoalSecondaryColor(level)}
            isSmart={Boolean(note.goal_is_smart)}
            size={12}
        />
    ) : null;
    const name = onOpenGoal ? (
        <button
            type="button"
            className={`${styles.contextPrimary} ${styles.goalLink}`}
            onClick={(event) => { event.stopPropagation(); onOpenGoal(note); }}
        >
            {label}
        </button>
    ) : <span className={styles.contextPrimary}>{label}</span>;
    if (kind === 'goal') return <span className={styles.goalContext}>{name}{icon}</span>;
    const prefix = NOTE_KIND_LABELS[kind === 'review' ? 'goal_review' : 'goal_completion'];
    const heading = (
        <span className={styles.goalContext}>
            <span className={styles.noteKindPrefix}>{prefix}:</span>
            {icon}
            {name}
        </span>
    );
    if (kind !== 'review') return heading;
    return (
        <span className={styles.reviewHeading}>
            {heading}
            <ReviewStatusBadge status={note.review_data?.status} />
        </span>
    );
}

/** A program note's heading, a link to its program: the name in its colour, a date in its block's. */
export function ProgramNoteHeading({ note, to }) {
    const date = note.context_type === 'program_date' && note.calendar_date ? formatLiteralDate(note.calendar_date) : null;
    return (
        <Link className={`${styles.contextPrimary} ${styles.goalLink}`} to={to} onClick={(event) => event.stopPropagation()}>
            <span style={note.program_color ? { color: note.program_color } : undefined}>{note.program_name || 'Program'}</span>
            {date ? (
                <>
                    {' · '}
                    <span style={note.block_color ? { color: note.block_color } : undefined}>{date}</span>
                </>
            ) : null}
        </Link>
    );
}
