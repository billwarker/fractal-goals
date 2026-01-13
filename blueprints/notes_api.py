"""
Notes API Blueprint

Provides endpoints for managing timestamped notes on sessions, activity instances, and sets.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import uuid
import logging

from models import get_engine, get_session, Note, Session, ActivityInstance, ActivityDefinition, format_utc

logger = logging.getLogger(__name__)

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


@notes_bp.route('/<root_id>/sessions/<session_id>/notes', methods=['GET'])
def get_session_notes(root_id, session_id):
    """
    Get all notes for a session (includes activity instance and set notes).
    
    Returns notes in reverse chronological order.
    """
    db = get_session(get_engine())
    try:
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id == session_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([n.to_dict() for n in notes])
    except Exception as e:
        logger.error(f"Error fetching session notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/activity-instances/<instance_id>/notes', methods=['GET'])
def get_activity_instance_notes(root_id, instance_id):
    """Get notes for a specific activity instance."""
    db = get_session(get_engine())
    try:
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([n.to_dict() for n in notes])
    except Exception as e:
        logger.error(f"Error fetching activity instance notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/sessions/<session_id>/previous-session-notes', methods=['GET'])
def get_previous_session_notes(root_id, session_id):
    """
    Get session-level notes from the last 3 sessions (excluding current).
    
    Returns notes grouped by session, ordered by session date (most recent first).
    """
    db = get_session(get_engine())
    try:
        # Get the 3 most recent sessions before this one
        # Use nullslast() so sessions with actual start times are prioritized
        previous_sessions = db.query(Session).filter(
            Session.root_id == root_id,
            Session.id != session_id,
            Session.deleted_at == None
        ).order_by(Session.session_start.desc().nullslast(), Session.created_at.desc()).limit(3).all()
        
        if not previous_sessions:
            return jsonify([])
        
        session_ids = [s.id for s in previous_sessions]
        
        # Fetch session-level notes from these sessions
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id.in_(session_ids),
            Note.context_type == 'session',
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        # Group notes by session
        results = []
        for session in previous_sessions:
            session_notes = [n.to_dict() for n in notes if n.session_id == session.id]
            if session_notes:  # Only include sessions that have notes
                results.append({
                    'session_id': session.id,
                    'session_name': session.name,
                    'session_date': format_utc(session.session_start or session.created_at),
                    'notes': session_notes
                })
        
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error fetching previous session notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/notes', methods=['GET'])
def get_activity_definition_notes(root_id, activity_id):
    """
    Get recent notes for an activity definition (across all sessions).
    
    Query params:
    - limit: Maximum number of notes to return (default 20)
    - exclude_session: Session ID to exclude from results
    """
    db = get_session(get_engine())
    try:
        limit = request.args.get('limit', 20, type=int)
        exclude_session_id = request.args.get('exclude_session', None)
        
        query = db.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_definition_id == activity_id,
            Note.deleted_at == None
        )
        
        if exclude_session_id:
            query = query.filter(Note.session_id != exclude_session_id)
        
        notes = query.order_by(Note.created_at.desc()).limit(limit).all()
        
        # Enrich with session info for context
        results = []
        for note in notes:
            data = note.to_dict()
            if note.session:
                data['session_name'] = note.session.name
                data['session_date'] = format_utc(note.session.session_start or note.session.created_at)
            results.append(data)
        
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error fetching activity definition notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/history', methods=['GET'])
def get_activity_history(root_id, activity_id):
    """
    Get previous instances of an activity with their metrics.
    
    Query params:
    - limit: Maximum number of instances to return (default 3)
    - exclude_session: Session ID to exclude from results (typically current session)
    """
    db = get_session(get_engine())
    try:
        limit = request.args.get('limit', 3, type=int)
        exclude_session_id = request.args.get('exclude_session', None)
        
        query = db.query(ActivityInstance).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.deleted_at == None
        )
        
        if exclude_session_id:
            query = query.filter(ActivityInstance.session_id != exclude_session_id)
        
        instances = query.order_by(ActivityInstance.created_at.desc()).limit(limit).all()
        
        # Get IDs for fetching notes
        instance_ids = [inst.id for inst in instances]
        
        # Fetch notes for these instances
        notes_by_instance = {}
        if instance_ids:
            notes = db.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at == None
            ).order_by(Note.created_at).all()
            
            for n in notes:
                if n.activity_instance_id not in notes_by_instance:
                    notes_by_instance[n.activity_instance_id] = []
                notes_by_instance[n.activity_instance_id].append(n.to_dict())
        
        # Include session info and notes
        results = []
        for inst in instances:
            data = inst.to_dict()
            if inst.session:
                data['session_name'] = inst.session.name
                data['session_date'] = format_utc(inst.session.session_start or inst.session.created_at)
            
            # Attach notes
            data['notes'] = notes_by_instance.get(inst.id, [])
            
            results.append(data)
        
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error fetching activity history: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes', methods=['POST'])
def create_note(root_id):
    """
    Create a new note.
    
    Request body:
    {
        "context_type": "session" | "activity_instance" | "set",
        "context_id": "<id of parent entity>",
        "session_id": "<session id>",
        "activity_instance_id": "<optional>",
        "activity_definition_id": "<optional>",
        "set_index": <optional integer>,
        "content": "<note text>",
        "image_data": "<optional base64 encoded image>"
    }
    """
    db = get_session(get_engine())
    try:
        data = request.get_json()
        
        content = data.get('content', '').strip()
        image_data = data.get('image_data')
        
        # Either content or image_data is required
        if not content and not image_data:
            return jsonify({"error": "Note content or image is required"}), 400
        
        # If only image, set a default content placeholder
        if not content and image_data:
            content = "[Image]"
        
        context_type = data.get('context_type', 'session')
        if context_type not in ('session', 'activity_instance', 'set'):
            return jsonify({"error": "Invalid context_type. Must be 'session', 'activity_instance', or 'set'"}), 400
        
        note = Note(
            id=str(uuid.uuid4()),
            root_id=root_id,
            context_type=context_type,
            context_id=data.get('context_id'),
            session_id=data.get('session_id'),
            activity_instance_id=data.get('activity_instance_id'),
            activity_definition_id=data.get('activity_definition_id'),
            set_index=data.get('set_index'),
            content=content,
            image_data=image_data
        )
        
        db.add(note)
        db.commit()
        
        logger.info(f"Created note {note.id} for {context_type} {note.context_id}")
        return jsonify(note.to_dict()), 201
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
def update_note(root_id, note_id):
    """
    Update a note's content.
    
    Request body:
    {
        "content": "<updated note text>"
    }
    """
    db = get_session(get_engine())
    try:
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at == None
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        data = request.get_json()
        if 'content' in data:
            content = data['content'].strip()
            if not content:
                return jsonify({"error": "Note content cannot be empty"}), 400
            note.content = content
        
        db.commit()
        
        logger.info(f"Updated note {note_id}")
        return jsonify(note.to_dict())
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['DELETE'])
def delete_note(root_id, note_id):
    """Soft delete a note."""
    db = get_session(get_engine())
    try:
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at == None
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        note.deleted_at = datetime.now(timezone.utc)
        db.commit()
        
        logger.info(f"Deleted note {note_id}")
        return jsonify({"success": True})
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()
