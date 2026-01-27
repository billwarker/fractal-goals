"""
Notes API Blueprint

Provides endpoints for managing timestamped notes on sessions, activity instances, and sets.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import uuid
import logging

from models import get_engine, get_session, Note, Session, ActivityInstance, ActivityDefinition, format_utc, validate_root_goal
from validators import validate_request, NoteCreateSchema, NoteUpdateSchema
from services.serializers import serialize_note, serialize_activity_instance
from blueprints.auth_api import token_required

logger = logging.getLogger(__name__)

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


@notes_bp.route('/<root_id>/sessions/<session_id>/notes', methods=['GET'])
@token_required
def get_session_notes(current_user, root_id, session_id):
    """
    Get all notes for a session (includes activity instance and set notes).
    
    Returns notes in reverse chronological order.
    """
    db = get_session(get_engine())
    try:
        # Verify ownership
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id == session_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([serialize_note(n) for n in notes])
    except Exception as e:
        logger.error(f"Error fetching session notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/activity-instances/<instance_id>/notes', methods=['GET'])
@token_required
def get_activity_instance_notes(current_user, root_id, instance_id):
    """Get notes for a specific activity instance."""
    db = get_session(get_engine())
    try:
        # Verify ownership
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([serialize_note(n) for n in notes])
    except Exception as e:
        logger.error(f"Error fetching activity instance notes: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/sessions/<session_id>/previous-session-notes', methods=['GET'])
@token_required
def get_previous_session_notes(current_user, root_id, session_id):
    """
    Get session-level notes from the last 3 sessions (excluding current).
    
    Returns notes grouped by session, ordered by session date (most recent first).
    """
    db = get_session(get_engine())
    try:
        # Verify ownership
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
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
            session_notes = [serialize_note(n) for n in notes if n.session_id == session.id]
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
@token_required
def get_activity_definition_notes(current_user, root_id, activity_id):
    """Get recent notes for an activity definition if owned by user."""
    db = get_session(get_engine())
    try:
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
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
            data = serialize_note(note)
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
@token_required
def get_activity_history(current_user, root_id, activity_id):
    """Get previous instances of an activity with their metrics if owned by user."""
    db = get_session(get_engine())
    try:
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
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
                notes_by_instance[n.activity_instance_id].append(serialize_note(n))
        
        # Include session info and notes
        results = []
        for inst in instances:
            data = serialize_activity_instance(inst)
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
@token_required
@validate_request(NoteCreateSchema)
def create_note(current_user, root_id, validated_data):
    """
    Create a new note if owned by user.
    """
    db = get_session(get_engine())
    try:
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        content = validated_data.get('content', '')  # Already sanitized
        image_data = validated_data.get('image_data')
        
        # Either content or image_data is required (content is required by schema)
        # If only image, set a default content placeholder
        if not content and image_data:
            content = "[Image]"
        
        note = Note(
            id=str(uuid.uuid4()),
            root_id=root_id,
            context_type=validated_data['context_type'],  # Already validated by schema
            context_id=validated_data['context_id'],
            session_id=validated_data.get('session_id'),
            activity_instance_id=validated_data.get('activity_instance_id'),
            activity_definition_id=validated_data.get('activity_definition_id'),
            set_index=validated_data.get('set_index'),
            content=content,
            image_data=image_data
        )
        
        db.add(note)
        db.commit()
        
        logger.info(f"Created note {note.id} for {validated_data['context_type']} {note.context_id}")
        return jsonify(serialize_note(note)), 201
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
@token_required
@validate_request(NoteUpdateSchema)
def update_note(current_user, root_id, note_id, validated_data):
    db = get_session(get_engine())
    try:
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at == None
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        if 'content' in validated_data:
            note.content = validated_data['content']
        
        db.commit()
        logger.info(f"Updated note {note_id}")
        return jsonify(serialize_note(note))
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['DELETE'])
@token_required
def delete_note(current_user, root_id, note_id):
    db = get_session(get_engine())
    try:
        root = validate_root_goal(db, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
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
