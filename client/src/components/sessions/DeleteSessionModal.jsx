import React from 'react';

import { useOwnedNoteCount } from '../../hooks/useOwnedNoteCount';
import { notesPhrase } from '../../utils/noteTypes';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';

/** Confirms deleting a session, saying how many of its notes go with it (services/note_ownership.py). */
export default function DeleteSessionModal({ rootId, session, isOpen, onClose, onConfirm, confirmText = 'Delete Session' }) {
    const noteCount = useOwnedNoteCount(rootId, { session_id: session?.id }, { enabled: Boolean(isOpen && session?.id) });
    const name = session?.name ? `"${session.name}"` : 'this session';
    const notes = noteCount ? ` and its ${notesPhrase(noteCount)}` : '';
    return (
        <DeleteConfirmModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="Delete Session"
            message={`Delete ${name}${notes}? This can't be undone.`}
            confirmText={confirmText}
        />
    );
}
