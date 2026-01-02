from flask import Blueprint, request, jsonify
import json
import uuid
from datetime import datetime, timedelta
import models
from models import (
    get_session,
    Program, ProgramBlock, ProgramDay, ScheduledSession, Goal,
    validate_root_goal
)

# Create blueprint
programs_bp = Blueprint('programs', __name__, url_prefix='/api')

# Global engine removed
# engine = get_engine()

# Helper to sync nested structure (Shadow Write)
def sync_program_structure(session, program, schedule_list):
    """
    Syncs the JSON schedule list (from frontend) into ProgramBlock/Day/Session tables.
    schedule_list matches frontend 'weeklySchedule' array (Blocks).
    """
    if not isinstance(schedule_list, list):
        return

    # 1. Map existing blocks
    existing_blocks = {b.id: b for b in program.blocks}
    processed_block_ids = set()

    for block_data in schedule_list:
        b_id = block_data.get('id') or str(uuid.uuid4())
        
        # Parse metadata
        # Frontend usually validates dates, but safer to try/except in prod (omitted for brevity)
        start_dt = datetime.fromisoformat(block_data['startDate'].replace('Z', '')).date()
        end_dt = datetime.fromisoformat(block_data['endDate'].replace('Z', '')).date()
        
        if b_id in existing_blocks:
            block = existing_blocks[b_id]
            block.name = block_data.get('name', 'Block')
            block.start_date = start_dt
            block.end_date = end_dt
            block.color = block_data.get('color')
        else:
            block = ProgramBlock(
                id=b_id,
                program_id=program.id,
                name=block_data.get('name', 'Block'),
                start_date=start_dt,
                end_date=end_dt,
                color=block_data.get('color')
            )
            session.add(block)
        
        processed_block_ids.add(block.id)
        
        # SYNC DAYS (Instantiate Templates)
        # block_data['weeklySchedule'] is e.g. { 'monday': ['id1'], 'tuesday': [] }
        templates_map = block_data.get('weeklySchedule', {})
        
        # We need to ensure the block is flushed to DB to have ID if needed? 
        # (It has ID assigned above).
        
        # Get existing days
        # We need to query them or access via relationship? 
        # Accessing via relationship is loaded.
        existing_days = {(d.date): d for d in block.days}
        
        # Iterate date range
        curr = start_dt
        day_index = 1
        while curr <= end_dt:
            day_name = curr.strftime('%A').lower() # monday, tuesday...
            day_templates = templates_map.get(day_name, [])
            
            # Ensure day exists
            if curr in existing_days:
                day = existing_days[curr]
                day.day_number = day_index
            else:
                day = ProgramDay(
                    id=str(uuid.uuid4()),
                    block_id=block.id,
                    date=curr,
                    day_number=day_index,
                    name=day_name.capitalize()
                )
                session.add(day)
                # Note: We must add to the relationship or session to track it for this loop if we access it?
                # Usually safely handled by generic append or session add.
            
            # SYNC SESSIONS
            # day.sessions...
            # This is tricky because we don't have IDs for these generated sessions in the incoming JSON 
            # (since JSON is Template-based, not Instance-based).
            # Strategy: Delete all sessions for this day and recreate based on template.
            # This destroys completion data! 
            # BETTER STRATEGY: Match by template_id? 
            # If we are "applying template", we probably want to preserve completion if template matches.
            
            # Get existing sessions for day
            existing_sessions = {s.session_template_id: s for s in day.sessions}
            active_template_ids = []
            
            for tid in day_templates:
                if tid in existing_sessions:
                    # Keep it
                    active_template_ids.append(tid)
                else:
                    # Create new
                    new_session = ScheduledSession(
                        id=str(uuid.uuid4()),
                        day_id=day.id,
                        session_template_id=tid,
                        is_completed=False
                    )
                    session.add(new_session)
                    # We need to associate it with day if day is new (and thus not in DB/relations yet fully?)
                    # If day is in session, assigning day_id is enough? 
                    # Assigning `day=day` is safer.
                    new_session.day = day
                    active_template_ids.append(tid)
            
            # Remove sessions that are no longer in the template for this day
            for s in day.sessions:
                if s.session_template_id not in active_template_ids:
                     # Only remove if it's not completed? Or strictly enforce template?
                     # Strictly enforce template for now.
                     session.delete(s)
            
            curr += timedelta(days=1)
            day_index += 1

    # Cleanup deleted blocks
    for bid, blk in existing_blocks.items():
        if bid not in processed_block_ids:
            session.delete(blk)

# ============================================================================
# PROGRAM ENDPOINTS
# ============================================================================

@programs_bp.route('/<root_id>/programs', methods=['GET'])
def get_programs(root_id):
    """Get all training programs for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        programs = session.query(Program).filter_by(root_id=root_id).all()
        result = [program.to_dict() for program in programs]
        return jsonify(result)
        
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['GET'])
def get_program(root_id, program_id):
    """Get a specific training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            return jsonify({"error": "Program not found"}), 404
        
        return jsonify(program.to_dict())
        
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs', methods=['POST'])
def create_program(root_id):
    """Create a new training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Program name is required"}), 400
        
        if not data.get('start_date'):
            return jsonify({"error": "Start date is required"}), 400
            
        if not data.get('end_date'):
            return jsonify({"error": "End date is required"}), 400
        
        # Parse dates
        try:
            start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
        except:
            return jsonify({"error": "Invalid date format"}), 400
        
        # Create new program
        schedule_list = data.get('weeklySchedule', [])
        
        new_program = Program(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name=data['name'],
            description=data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            goal_ids=json.dumps(data.get('selectedGoals', [])),
            weekly_schedule=json.dumps(schedule_list)
        )
        
        session.add(new_program)
        
        # Sync to new tables
        sync_program_structure(session, new_program, schedule_list)
        
        session.commit()
        
        return jsonify(new_program.to_dict()), 201
        
    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['PUT'])
def update_program(root_id, program_id):
    """Update a training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            return jsonify({"error": "Program not found"}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            program.name = data['name']
        if 'description' in data:
            program.description = data['description']
        if 'start_date' in data:
            try:
                program.start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            except:
                return jsonify({"error": "Invalid start_date format"}), 400
        if 'end_date' in data:
            try:
                program.end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
            except:
                return jsonify({"error": "Invalid end_date format"}), 400
        if 'selectedGoals' in data:
            program.goal_ids = json.dumps(data['selectedGoals'])
        
        # Sync Schedule
        if 'weeklySchedule' in data:
            schedule_list = data['weeklySchedule']
            # Update Legacy JSON
            program.weekly_schedule = json.dumps(schedule_list)
            # Update New Tables
            sync_program_structure(session, program, schedule_list)
            
        if 'is_active' in data:
            program.is_active = data['is_active']
        
        session.commit()
        
        return jsonify(program.to_dict())
        
    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['DELETE'])
def delete_program(root_id, program_id):
    """Delete a training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            return jsonify({"error": "Program not found"}), 404
        
        session.delete(program)
        session.commit()
        
        return jsonify({"message": "Program deleted successfully"})
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days', methods=['POST'])
def add_block_day(root_id, program_id, block_id):
    """Add a configured day to a program block (and optionally cascade)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        # Validate hierarchy
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block: return jsonify({"error": "Block not found"}), 404
        
        data = request.get_json()
        name = data.get('name')
        
        # Multiple templates support
        template_ids = data.get('template_ids', [])
        if 'template_id' in data and data['template_id']:
            if data['template_id'] not in template_ids:
                template_ids.append(data['template_id'])
        
        day_of_week = data.get('day_of_week') # 'Monday', etc.
        cascade = data.get('cascade', False)
        
        # Identify Target Blocks
        target_blocks = [block]
        if cascade:
            all_blocks = session.query(ProgramBlock).filter_by(program_id=program_id).all()
            all_blocks.sort(key=lambda b: b.start_date if b.start_date else datetime.max.date())
            try:
                idx = next(i for i, b in enumerate(all_blocks) if b.id == block_id)
                target_blocks.extend(all_blocks[idx+1:])
            except StopIteration: pass

        created_count = 0
        
        for target in target_blocks:
            dates_to_add = []
            if day_of_week and target.start_date and target.end_date:
                curr = target.start_date
                while curr <= target.end_date:
                    if curr.strftime('%A') == day_of_week: dates_to_add.append(curr)
                    curr += timedelta(days=1)
            else:
                dates_to_add.append(None)
            
            for d in dates_to_add:
                day = None
                if d: day = session.query(ProgramDay).filter_by(block_id=target.id, date=d).first()
                
                if not day:
                    count = session.query(ProgramDay).filter_by(block_id=target.id).count()
                    day_num = count + 1
                    day = ProgramDay(
                        id=str(uuid.uuid4()),
                        block_id=target.id,
                        date=d,
                        day_number=day_num,
                        name=name
                    )
                    session.add(day)
                else:
                    if name: day.name = name
                
                # Add Sessions
                for tid in template_ids:
                     new_session = ScheduledSession(
                        id=str(uuid.uuid4()),
                        day_id=day.id,
                        session_template_id=tid,
                        is_completed=False
                    )
                     new_session.day = day
                     session.add(new_session)
                
                created_count += 1

        session.commit()
        return jsonify({"message": f"Added {created_count} days/sessions"}), 201

    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['PUT'])
def update_block_day(root_id, program_id, block_id, day_id):
    """Update a specific program day."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day: return jsonify({"error": "Day not found"}), 404
        
        data = request.get_json()
        if 'name' in data: day.name = data['name']
        if 'day_number' in data: day.day_number = data['day_number']
        
        cascade = data.get('cascade', False)
        
        # Update Session Templates
        update_sessions = False
        template_ids = data.get('template_ids', [])
        if 'template_ids' in data: update_sessions = True
        
        if 'template_id' in data:
            update_sessions = True
            if data['template_id'] and data['template_id'] not in template_ids:
                 template_ids.append(data['template_id'])

        if update_sessions:
            for s in day.sessions: session.delete(s)
            
            for tid in template_ids:
                new_session = ScheduledSession(
                    id=str(uuid.uuid4()),
                    day_id=day.id,
                    session_template_id=tid,
                    is_completed=False
                )
                new_session.day = day
                session.add(new_session)
        
        # Cascade Updates
        if cascade:
            all_blocks = session.query(ProgramBlock).filter_by(program_id=program_id).all()
            all_blocks.sort(key=lambda b: b.start_date if b.start_date else datetime.max.date())
            try:
                idx = next(i for i, b in enumerate(all_blocks) if b.id == block_id)
                targets = all_blocks[idx+1:]
                
                for target in targets:
                    # Match by day_number
                    t_day = session.query(ProgramDay).filter_by(block_id=target.id, day_number=day.day_number).first()
                    if t_day:
                        if 'name' in data: t_day.name = data['name']
                        if update_sessions:
                             for s in t_day.sessions: session.delete(s)
                             for tid in template_ids:
                                 ns = ScheduledSession(
                                     id=str(uuid.uuid4()),
                                     day_id=t_day.id,
                                     session_template_id=tid,
                                     is_completed=False
                                 )
                                 ns.day = t_day
                                 session.add(ns)
            except StopIteration: pass
        
        session.commit()
        return jsonify({"message": "Day updated successfully"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['DELETE'])
def delete_block_day(root_id, program_id, block_id, day_id):
    """Delete a program day."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day: return jsonify({"error": "Day not found"}), 404
        session.delete(day)
        session.commit()
        return jsonify({"message": "Day deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/copy', methods=['POST'])
def copy_block_day(root_id, program_id, block_id, day_id):
    """Copy a day to other blocks."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        source_day = session.query(ProgramDay).filter_by(id=day_id).first()
        if not source_day: return jsonify({"error": "Source day not found"}), 404
        
        data = request.get_json()
        target_mode = data.get('target_mode', 'all') # 'all'
        
        # Find Target Blocks
        query = session.query(ProgramBlock).filter_by(program_id=program_id)
        if target_mode == 'all':
             query = query.filter(ProgramBlock.id != block_id)
        
        target_blocks = query.all()
        copied_count = 0
        
        for target in target_blocks:
             # Find matching day or create
             target_day = session.query(ProgramDay).filter_by(block_id=target.id, day_number=source_day.day_number).first()
             
             if not target_day:
                  # Create
                  target_day = ProgramDay(
                      id=str(uuid.uuid4()),
                      block_id=target.id,
                      day_number=source_day.day_number,
                      name=source_day.name,
                      date=None 
                  )
                  session.add(target_day)
             else:
                  target_day.name = source_day.name
             
             # Copy Sessions
             for s in target_day.sessions:
                  session.delete(s)
             
             for s in source_day.sessions:
                  new_s = ScheduledSession(
                      id=str(uuid.uuid4()),
                      day_id=target_day.id,
                      session_template_id=s.session_template_id,
                      is_completed=False
                  )
                  new_s.day = target_day
                  session.add(new_s)
             
             copied_count += 1
             
        session.commit()
        return jsonify({"message": f"Copied to {copied_count} blocks"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/active-days', methods=['GET'])
def get_active_program_days(root_id):
    """
    Get program days from active programs where current date falls within the block's date range.
    Returns days that have at least one scheduled session with a template.
    """
    engine = models.get_engine()
    session = get_session(engine)
    try:
        from datetime import date
        from models import SessionTemplate
        import json
        
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        today = date.today()
        
        # Get all active programs for this fractal
        active_programs = session.query(Program).filter_by(
            root_id=root_id,
            is_active=True
        ).all()
        
        result = []
        
        for program in active_programs:
            # Find blocks that contain today's date
            for block in program.blocks:
                if block.start_date and block.end_date:
                    if block.start_date <= today <= block.end_date:
                        # Find days within this block that have sessions
                        for day in block.days:
                            # Only include days with scheduled sessions that have templates
                            sessions_with_templates = [
                                s for s in day.sessions 
                                if s.session_template_id and not s.is_completed
                            ]
                            
                            if sessions_with_templates:
                                # Fetch template details for each session
                                session_details = []
                                for scheduled_session in sessions_with_templates:
                                    template = session.query(SessionTemplate).filter_by(
                                        id=scheduled_session.session_template_id
                                    ).first()
                                    
                                    if template:
                                        session_details.append({
                                            "scheduled_session_id": scheduled_session.id,
                                            "template_id": template.id,
                                            "template_name": template.name,
                                            "template_description": template.description,
                                            "template_data": json.loads(template.template_data) if template.template_data else {}
                                        })
                                
                                if session_details:
                                    result.append({
                                        "program_id": program.id,
                                        "program_name": program.name,
                                        "block_id": block.id,
                                        "block_name": block.name,
                                        "block_color": block.color,
                                        "day_id": day.id,
                                        "day_name": day.name,
                                        "day_number": day.day_number,
                                        "day_date": day.date.isoformat() if day.date else None,
                                        "sessions": session_details
                                    })
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/goals', methods=['POST'])
def attach_goal_to_block(root_id, program_id, block_id):
    """Attach a goal to a block and update its deadline."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        block = session.query(ProgramBlock).filter_by(id=block_id).first()
        if not block: return jsonify({"error": "Block not found"}), 404
        
        data = request.get_json()
        goal_id = data.get('goal_id')
        deadline_str = data.get('deadline')
        
        if not goal_id: return jsonify({"error": "Goal ID required"}), 400
        
        # 1. Update Block goal_ids
        current_ids = json.loads(block.goal_ids) if block.goal_ids else []
        if goal_id not in current_ids:
            current_ids.append(goal_id)
            block.goal_ids = json.dumps(current_ids)
            session.add(block)
            
        # 2. Update Goal Deadline
        if deadline_str:
            goal = session.query(Goal).get(goal_id)
            if goal:
                try:
                    if len(deadline_str) > 10: deadline_str = deadline_str[:10]
                    goal.deadline = datetime.strptime(deadline_str, '%Y-%m-%d').date()
                    session.add(goal)
                except ValueError:
                     return jsonify({"error": "Invalid date format"}), 400
        
        session.commit()
        return jsonify({"message": "Goal attached and updated", "block": block.to_dict()})
        
    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()
