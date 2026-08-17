import NoteQuickAdd from '../sessionDetail/NoteQuickAdd';
import NoteTimeline from '../sessionDetail/NoteTimeline';
import styles from './CircuitRunCard.module.css';


export default function CircuitRunNotes({
    notes,
    noteTarget,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onNoteCreated,
}) {
    if (!notes.length && !onAddNote) return null;
    const handleAdd = async (content) => {
        if (!content.trim() || !onAddNote) return;
        await onAddNote({ ...noteTarget.payload, content: content.trim() });
        onNoteCreated?.();
    };
    return (
        <div className={styles.notesSection} aria-label={`${noteTarget.label} notes`}>
            {notes.length > 0 && (
                <div className={styles.notesTimeline}>
                    <NoteTimeline
                        notes={notes}
                        onUpdate={onUpdateNote}
                        onDelete={onDeleteNote}
                        minimal={false}
                        showTypePill
                    />
                </div>
            )}
            {onAddNote && (
                <NoteQuickAdd
                    key={`${noteTarget.kind}:${noteTarget.payload.context_id}:${noteTarget.payload.activity_set_id || ''}`}
                    onSubmit={handleAdd}
                    placeholder={noteTarget.placeholder}
                />
            )}
        </div>
    );
}
