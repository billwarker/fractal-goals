"""Batch program display names without changing canonical note ownership."""
from models import Program


def attach_program_names(db_session, notes_payload):
    notes = notes_payload if isinstance(notes_payload, list) else [notes_payload]
    program_ids = {
        note.get('context_id')
        for note in notes
        if note.get('context_type') == 'program' and note.get('context_id')
    }
    if not program_ids:
        return notes_payload

    programs = db_session.query(Program.id, Program.name).filter(
        Program.id.in_(program_ids),
    ).all()
    program_names = {program_id: name for program_id, name in programs}
    for note in notes:
        if note.get('context_type') == 'program':
            note['program_name'] = program_names.get(note.get('context_id'))
    return notes_payload

