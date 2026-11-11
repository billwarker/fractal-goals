import React from 'react';

import SidePaneNotePanel from '../common/SidePaneNotePanel';
import { NoteTimeline } from '../notes';
import { useProgramDateNotes } from '../../hooks/useProgramDateNotes';
import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './ProgramSidePane.module.css';

/**
 * Notes on a calendar date in the program: about the day itself, whatever is scheduled on it.
 * They also list under Programs on the Notes page. Nothing shows until the date has notes;
 * they are written from the pane's footer (ProgramDateNoteComposer).
 */
export default function ProgramDateNotes({ rootId, programId, notes = [] }) {
    const { updateNote, deleteNote } = useProgramDateNotes(rootId, programId);
    if (!notes.length) return null;
    return (
        <section className={styles.card} aria-labelledby="program-date-notes">
            <div className={styles.cardTitle}>
                <h3 id="program-date-notes">Notes ({notes.length})</h3>
            </div>
            <NoteTimeline
                notes={notes}
                onEdit={updateNote}
                onDelete={deleteNote}
                groupByDate={false}
                showContext={false}
                minimal
                variant="flat"
            />
        </section>
    );
}

/** The day pane's footer: a quick note on the calendar date. */
export function ProgramDateNoteComposer({ rootId, programId, date }) {
    const { addNote } = useProgramDateNotes(rootId, programId);
    return (
        <SidePaneNotePanel
            composerOnly
            className={styles.dayNotesFooter}
            rootId={rootId}
            placeholder={`Add a note for ${formatLiteralDate(date, { year: undefined })}…`}
            onSubmit={(content, attachments) => addNote(date, content, attachments)}
        />
    );
}
