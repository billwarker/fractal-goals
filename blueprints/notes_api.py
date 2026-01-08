"""
Notes API Blueprint

Provides endpoints for creating, reading, updating, and deleting notes
attached to any entity in the system (goals, sessions, activity instances, programs, program days).

Supports:
- Hierarchical note aggregation (e.g., session notes include activity instance notes)
- Time-series feed with filtering
- Activity definition history (notes from previous instances)
"""

from flask import Blueprint, request, jsonify
from sqlalchemy import or_, and_, desc
from datetime import datetime, timezone

from models import (
    get_engine, get_session, validate_root_goal, utc_now,
    Note, Session, ActivityInstance, ProgramDay, ProgramBlock, Goal
)

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


def get_db_session():
    """Get a database session."""
    engine = get_engine()
    return get_session(engine)


def populate_denormalized_fields(db_session, note, entity_type, entity_id):
    """
    Populate denormalized parent references based on entity type.
    This enables efficient hierarchical queries.
    """
    if entity_type == 'activity_instance':
        instance = db_session.query(ActivityInstance).get(entity_id)
        if instance:
            note.session_id = instance.session_id
            session_obj = db_session.query(Session).get(instance.session_id) if instance.session_id else None
            if session_obj and session_obj.program_day_id:
                note.program_day_id = session_obj.program_day_id
                program_day = db_session.query(ProgramDay).get(session_obj.program_day_id)
                if program_day:
                    block = db_session.query(ProgramBlock).get(program_day.block_id)
                    if block:
                        note.program_id = block.program_id
    
    elif entity_type == 'session':
        session_obj = db_session.query(Session).get(entity_id)
        if session_obj:
            note.session_id = entity_id
            if session_obj.program_day_id:
                note.program_day_id = session_obj.program_day_id
                program_day = db_session.query(ProgramDay).get(session_obj.program_day_id)
                if program_day:
                    block = db_session.query(ProgramBlock).get(program_day.block_id)
                    if block:
                        note.program_id = block.program_id
    
    elif entity_type == 'program_day':
        program_day = db_session.query(ProgramDay).get(entity_id)
        if program_day:
            note.program_day_id = entity_id
            block = db_session.query(ProgramBlock).get(program_day.block_id)
            if block:
                note.program_id = block.program_id
    
    elif entity_type == 'program':
        note.program_id = entity_id
    
    # Goals don't need denormalized fields (they use entity_type/entity_id directly)


def get_entity_context(db_session, note):
    """
    Get additional context for display (activity name, session name, etc.).
    """
    context = {}
    
    if note.entity_type == 'activity_instance':
        instance = db_session.query(ActivityInstance).get(note.entity_id)
        if instance:
            context['activity_name'] = instance.definition.name if instance.definition else 'Unknown'
            if instance.session:
                context['session_name'] = instance.session.name
                context['session_id'] = instance.session.id
                context['session_date'] = instance.session.session_start.isoformat() if instance.session.session_start else None
    
    elif note.entity_type == 'session':
        session_obj = db_session.query(Session).get(note.entity_id)
        if session_obj:
            context['session_name'] = session_obj.name
            context['session_id'] = session_obj.id
            context['session_date'] = session_obj.session_start.isoformat() if session_obj.session_start else None
    
    elif note.entity_type == 'goal':
        goal = db_session.query(Goal).get(note.entity_id)
        if goal:
            context['goal_name'] = goal.name
            context['goal_type'] = goal.type
    
    elif note.entity_type == 'program':
        from models import Program
        program = db_session.query(Program).get(note.entity_id)
        if program:
            context['program_name'] = program.name
    
    elif note.entity_type == 'program_day':
        program_day = db_session.query(ProgramDay).get(note.entity_id)
        if program_day:
            context['day_name'] = program_day.name or f"Day {program_day.day_number}"
            context['day_date'] = program_day.date.isoformat() if program_day.date else None
    
    return context


# =============================================================================
# CRUD Endpoints
# =============================================================================

@notes_bp.route('/<root_id>/notes', methods=['POST'])
def create_note(root_id):
    """
    Create a new note attached to an entity.
    
    Request body:
    {
        "content": "Note text",
        "entity_type": "session" | "activity_instance" | "goal" | "program" | "program_day",
        "entity_id": "uuid"
    }
    """
    db = get_db_session()
    try:
        # Validate root
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        data = request.json or {}
        
        # Validate required fields
        content = data.get('content', '').strip()
        entity_type = data.get('entity_type')
        entity_id = data.get('entity_id')
        
        if not content:
            return jsonify({"error": "Content is required"}), 400
        if not entity_type:
            return jsonify({"error": "entity_type is required"}), 400
        if not entity_id:
            return jsonify({"error": "entity_id is required"}), 400
        
        valid_types = ['goal', 'session', 'activity_instance', 'program', 'program_day']
        if entity_type not in valid_types:
            return jsonify({"error": f"Invalid entity_type. Must be one of: {valid_types}"}), 400
        
        # Create note
        note = Note(
            content=content,
            content_type=data.get('content_type', 'text'),
            entity_type=entity_type,
            entity_id=entity_id,
            root_id=root_id,
            created_at=utc_now()
        )
        
        # Populate denormalized fields
        populate_denormalized_fields(db, note, entity_type, entity_id)
        
        db.add(note)
        db.commit()
        
        # Return with context
        result = note.to_dict()
        result['entity_context'] = get_entity_context(db, note)
        
        return jsonify(result), 201
        
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes', methods=['GET'])
def get_notes(root_id):
    """
    Get notes with filtering options.
    
    Query params:
    - entity_type: Filter by entity type
    - entity_id: Filter by specific entity
    - include_children: Include notes from descendant entities (default: true)
    - start_date: Filter notes after this date (ISO format)
    - end_date: Filter notes before this date (ISO format)
    - limit: Pagination limit (default: 50)
    - offset: Pagination offset (default: 0)
    """
    db = get_db_session()
    try:
        # Validate root
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        # Parse query params
        entity_type = request.args.get('entity_type')
        entity_id = request.args.get('entity_id')
        include_children = request.args.get('include_children', 'true').lower() == 'true'
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = int(request.args.get('offset', 0))
        
        # Base query
        query = db.query(Note).filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None)
        )
        
        # Apply entity filters with hierarchical support
        if entity_type and entity_id:
            if include_children:
                # Hierarchical query based on entity type
                if entity_type == 'session':
                    # Session notes + activity instance notes
                    query = query.filter(
                        or_(
                            and_(Note.entity_type == 'session', Note.entity_id == entity_id),
                            Note.session_id == entity_id
                        )
                    )
                elif entity_type == 'program':
                    # All notes within this program
                    query = query.filter(Note.program_id == entity_id)
                elif entity_type == 'program_day':
                    # Program day notes + session notes + activity notes
                    query = query.filter(Note.program_day_id == entity_id)
                else:
                    # Direct match only
                    query = query.filter(
                        Note.entity_type == entity_type,
                        Note.entity_id == entity_id
                    )
            else:
                # Direct match only
                query = query.filter(
                    Note.entity_type == entity_type,
                    Note.entity_id == entity_id
                )
        elif entity_type:
            # Filter by type only
            query = query.filter(Note.entity_type == entity_type)
        
        # Date filters
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(Note.created_at >= start_dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(Note.created_at <= end_dt)
            except ValueError:
                pass
        
        # Get total count before pagination
        total = query.count()
        
        # Apply ordering and pagination
        query = query.order_by(desc(Note.created_at))
        query = query.offset(offset).limit(limit)
        
        notes = query.all()
        
        # Build response with context
        notes_data = []
        for note in notes:
            note_dict = note.to_dict()
            note_dict['entity_context'] = get_entity_context(db, note)
            notes_data.append(note_dict)
        
        return jsonify({
            "notes": notes_data,
            "total": total,
            "has_more": offset + len(notes) < total
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['GET'])
def get_note(root_id, note_id):
    """Get a single note by ID."""
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None)
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        result = note.to_dict()
        result['entity_context'] = get_entity_context(db, note)
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
def update_note(root_id, note_id):
    """
    Update a note's content.
    
    Request body:
    {
        "content": "Updated text"
    }
    """
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None)
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        data = request.json or {}
        
        if 'content' in data:
            content = data['content'].strip()
            if not content:
                return jsonify({"error": "Content cannot be empty"}), 400
            note.content = content
        
        if 'content_type' in data:
            note.content_type = data['content_type']
        
        note.updated_at = utc_now()
        db.commit()
        
        result = note.to_dict()
        result['entity_context'] = get_entity_context(db, note)
        
        return jsonify(result), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['DELETE'])
def delete_note(root_id, note_id):
    """Soft-delete a note."""
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None)
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        note.deleted_at = utc_now()
        db.commit()
        
        return jsonify({"success": True, "id": note_id}), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


# =============================================================================
# Special Endpoints
# =============================================================================

@notes_bp.route('/<root_id>/notes/feed', methods=['GET'])
def get_notes_feed(root_id):
    """
    Get a time-series feed of all notes for a fractal.
    
    Query params:
    - entity_types: Comma-separated list of entity types to include
    - start_date: Filter notes after this date
    - end_date: Filter notes before this date
    - limit: Pagination limit (default: 50)
    - offset: Pagination offset (default: 0)
    """
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        # Parse query params
        entity_types_str = request.args.get('entity_types', '')
        entity_types = [t.strip() for t in entity_types_str.split(',') if t.strip()] if entity_types_str else None
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = int(request.args.get('offset', 0))
        
        # Base query
        query = db.query(Note).filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None)
        )
        
        # Filter by entity types
        if entity_types:
            query = query.filter(Note.entity_type.in_(entity_types))
        
        # Date filters
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(Note.created_at >= start_dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(Note.created_at <= end_dt)
            except ValueError:
                pass
        
        # Get total count
        total = query.count()
        
        # Apply ordering and pagination
        query = query.order_by(desc(Note.created_at))
        query = query.offset(offset).limit(limit)
        
        notes = query.all()
        
        # Build response with context
        notes_data = []
        for note in notes:
            note_dict = note.to_dict()
            note_dict['entity_context'] = get_entity_context(db, note)
            notes_data.append(note_dict)
        
        return jsonify({
            "notes": notes_data,
            "total": total,
            "has_more": offset + len(notes) < total
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/for-activity/<activity_def_id>', methods=['GET'])
def get_notes_for_activity(root_id, activity_def_id):
    """
    Get all notes for previous instances of an activity definition.
    
    This enables users to see notes from previous sessions when performing
    the same activity.
    
    Query params:
    - limit: Max notes to return (default: 50)
    - exclude_instance: Exclude notes from a specific instance (e.g., current)
    """
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        limit = min(int(request.args.get('limit', 50)), 200)
        exclude_instance = request.args.get('exclude_instance')
        
        # Get all activity instances for this definition
        instances_query = db.query(ActivityInstance).filter(
            ActivityInstance.activity_definition_id == activity_def_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None)
        )
        
        instance_ids = [inst.id for inst in instances_query.all()]
        
        if not instance_ids:
            return jsonify({"notes": [], "total": 0, "has_more": False}), 200
        
        # Get notes for these instances
        query = db.query(Note).filter(
            Note.entity_type == 'activity_instance',
            Note.entity_id.in_(instance_ids),
            Note.deleted_at.is_(None)
        )
        
        # Exclude current instance if specified
        if exclude_instance:
            query = query.filter(Note.entity_id != exclude_instance)
        
        total = query.count()
        
        query = query.order_by(desc(Note.created_at))
        query = query.limit(limit)
        
        notes = query.all()
        
        # Build response with context
        notes_data = []
        for note in notes:
            note_dict = note.to_dict()
            note_dict['entity_context'] = get_entity_context(db, note)
            notes_data.append(note_dict)
        
        return jsonify({
            "notes": notes_data,
            "total": total,
            "has_more": len(notes) < total,
            "activity_definition_id": activity_def_id
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/count', methods=['GET'])
def get_note_counts(root_id):
    """
    Get note counts for entities.
    
    Query params:
    - entity_type: Entity type to count
    - entity_ids: Comma-separated list of entity IDs
    - include_children: Include child notes in count (default: true)
    """
    db = get_db_session()
    try:
        root = validate_root_goal(db, root_id)
        if not root:
            return jsonify({"error": "Invalid root_id"}), 404
        
        entity_type = request.args.get('entity_type')
        entity_ids_str = request.args.get('entity_ids', '')
        entity_ids = [id.strip() for id in entity_ids_str.split(',') if id.strip()]
        include_children = request.args.get('include_children', 'true').lower() == 'true'
        
        if not entity_type or not entity_ids:
            return jsonify({"error": "entity_type and entity_ids are required"}), 400
        
        counts = {}
        
        for entity_id in entity_ids:
            query = db.query(Note).filter(
                Note.root_id == root_id,
                Note.deleted_at.is_(None)
            )
            
            if include_children:
                if entity_type == 'session':
                    query = query.filter(
                        or_(
                            and_(Note.entity_type == 'session', Note.entity_id == entity_id),
                            Note.session_id == entity_id
                        )
                    )
                elif entity_type == 'program':
                    query = query.filter(Note.program_id == entity_id)
                elif entity_type == 'program_day':
                    query = query.filter(Note.program_day_id == entity_id)
                else:
                    query = query.filter(
                        Note.entity_type == entity_type,
                        Note.entity_id == entity_id
                    )
            else:
                query = query.filter(
                    Note.entity_type == entity_type,
                    Note.entity_id == entity_id
                )
            
            counts[entity_id] = query.count()
        
        return jsonify({"counts": counts}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()
