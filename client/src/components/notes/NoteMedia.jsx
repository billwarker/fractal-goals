import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAttachmentDraft } from '../../hooks/useAttachmentDraft';
import { fractalNotesApi } from '../../utils/api/fractalNotesApi';
import { useOutbox } from '../../offline/OutboxContext';
import { SESSION_OP } from '../../offline/opKinds';
import Button from '../atoms/Button';
import MediaAttachment from './MediaAttachment';
import NoteAttachmentsEditor from './NoteAttachmentsEditor';
import styles from './MediaAttachment.module.css';

/** A note's attachments. `managing` (opened from the note's options menu) shows the editor. */
export default function NoteMedia({ note, managing = false, onDoneManaging }) {
    return <div>
        {(note.attachments || []).map((asset) => <MediaAttachment key={asset.id} rootId={note.root_id} asset={asset} />)}
        {managing && note.root_id && <NoteMediaManager note={note} onDone={onDoneManaging} />}
    </div>;
}

function NoteMediaManager({ note, onDone }) {
    const draft = useAttachmentDraft(note.root_id, note.attachments || []);
    const client = useQueryClient();
    const outbox = useOutbox();
    const mutation = useMutation({
        mutationFn: () => {
            const attachments = draft.payload();
            const body = { attachments };
            if (outbox && note.session_id) return outbox.submit({
                scope: note.session_id, kind: SESSION_OP.NOTE_UPDATE, method: 'put',
                url: `/${note.root_id}/notes/${note.id}`, body,
                coalesceKey: `note:${note.id}:attachments`, entityIds: [note.id],
                meta: { rootId: note.root_id, sessionId: note.session_id, noteId: note.id, attachments: draft.attachments() },
            });
            return fractalNotesApi.updateNote(note.root_id, note.id, body);
        },
        onSuccess: () => {
            onDone?.();
            client.invalidateQueries({ predicate: (query) => query.queryKey.includes(note.root_id) });
        },
    });
    return (
        <section className={styles.manager} aria-label="Manage attachments">
            <h4>Attachments</h4>
            <NoteAttachmentsEditor draft={draft} disabled={mutation.isPending} />
            <span className={styles.controls}>
                <Button disabled={mutation.isPending || draft.isBusy} title={draft.busyReason || undefined}
                    onClick={() => mutation.mutate()}>Save attachments</Button>
                <Button variant="secondary" disabled={mutation.isPending} onClick={() => onDone?.()}>Cancel</Button>
            </span>
            {mutation.isError && <p role="alert">{mutation.error?.response?.data?.error || 'Attachments could not be saved. Try again.'}</p>}
        </section>
    );
}
