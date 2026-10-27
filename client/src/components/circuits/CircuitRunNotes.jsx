import NoteQuickAdd from '../sessionDetail/NoteQuickAdd';
import NoteTimeline from '../sessionDetail/NoteTimeline';
import styles from './CircuitRunCard.module.css';


export default function CircuitRunNotes({
    rootId,
    notes,
    noteTarget,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onNoteCreated,
}) {
    if (!notes.length && !onAddNote) return null;
    const handleAdd = async (content, attachments = []) => {
        if (!content.trim() || !onAddNote) return;
        await onAddNote({ ...noteTarget.payload, content: content.trim(), ...(attachments.length ? { attachments } : {}) });
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
                    rootId={rootId}
                    onSubmit={handleAdd}
                    placeholder={noteTarget.placeholder}
                />
            )}
        </div>
    );
}
