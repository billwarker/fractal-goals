import React from 'react';

import { NoteTimeline } from '../notes';
import NoteQuickAdd from '../sessionDetail/NoteQuickAdd';
import { useProgramDateNotes } from '../../hooks/useProgramDateNotes';
import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './ProgramSidePane.module.css';

/**
 * Notes on a calendar date in the program: about the day itself, whatever is scheduled on it.
 * They also list under Programs on the Notes page.
 */
export default function ProgramDateNotes({ rootId, programId, date, notes = [] }) {
    const { addNote, updateNote, deleteNote } = useProgramDateNotes(rootId, programId);
    const label = formatLiteralDate(date, { year: undefined });
    return (
        <section className={styles.card} aria-labelledby="program-date-notes">
            <div className={styles.cardTitle}>
                <h3 id="program-date-notes">Notes{notes.length ? ` (${notes.length})` : ''}</h3>
            </div>
            {notes.length ? (
                <NoteTimeline
                    notes={notes}
                    onEdit={updateNote}
                    onDelete={deleteNote}
                    groupByDate={false}
                    showContext={false}
                    minimal
                    variant="flat"
                />
            ) : null}
            <NoteQuickAdd
                rootId={rootId}
                placeholder={`Add a note for ${label}…`}
                onSubmit={(content, attachments) => addNote(date, content, attachments)}
            />
        </section>
    );
}
