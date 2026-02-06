
import json
import uuid
import logging
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional

from services.serializers import format_utc
from models import (
    Program, ProgramBlock, ProgramDay, Goal, SessionTemplate, Session,
    validate_root_goal, _safe_load_json
)
from services import event_bus, Event, Events
from services.serializers import serialize_program, serialize_program_block, serialize_goal

logger = logging.getLogger(__name__)

class ProgramService:
    """
    Service for managing training programs, blocks, and days.
    """

    @staticmethod
    def _sync_program_structure(session, program: Program, schedule_list: List[Dict]):
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
            start_dt = None
            end_dt = None
            
            # Handle both frontend (camelCase) and backend (snake_case) formats
            start_str = block_data.get('startDate') or block_data.get('start_date')
            end_str = block_data.get('endDate') or block_data.get('end_date')
            
            if start_str:
                if 'T' in start_str: start_str = start_str.split('T')[0]
                try:
                    start_dt = datetime.fromisoformat(start_str.replace('Z', '')).date()
                except ValueError:
                    # Handle YYYY-MM-DD format directly if fromisoformat fails or double check
                    try:
                        start_dt = datetime.strptime(start_str, '%Y-%m-%d').date()
                    except: pass

            if end_str:
                if 'T' in end_str: end_str = end_str.split('T')[0]
                try:
                    end_dt = datetime.fromisoformat(end_str.replace('Z', '')).date()
                except ValueError:
                    try:
                        end_dt = datetime.strptime(end_str, '%Y-%m-%d').date()
                    except: pass
            
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
                program.blocks.append(block)
            
            processed_block_ids.add(block.id)

        # Cleanup deleted blocks
        for bid, blk in existing_blocks.items():
            if bid not in processed_block_ids:
                session.delete(blk)

    @staticmethod
    def get_programs(session, root_id: str) -> List[Dict]:
        root = validate_root_goal(session, root_id)
        if not root:
            return None
        
        from sqlalchemy.orm import selectinload
        programs = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates),
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.completed_sessions)
        ).filter_by(root_id=root_id).all()
        return [serialize_program(program) for program in programs]

    @staticmethod
    def get_program(session, root_id: str, program_id: str) -> Optional[Dict]:
        root = validate_root_goal(session, root_id)
        if not root:
            return None
        
        from sqlalchemy.orm import selectinload
        program = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates),
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.completed_sessions)
        ).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            return None
        
        return serialize_program(program)

    @staticmethod
    def create_program(session, root_id: str, validated_data: Dict) -> Dict:
        root = validate_root_goal(session, root_id)
        if not root:
            raise ValueError("Fractal not found")
        
        # Parse dates
        start_date = datetime.fromisoformat(validated_data['start_date'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(validated_data['end_date'].replace('Z', '+00:00'))
        
        schedule_list = validated_data.get('weeklySchedule', [])
        
        new_program = Program(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name=validated_data['name'],
            description=validated_data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            goal_ids=json.dumps(validated_data.get('selectedGoals', [])),
            weekly_schedule=json.dumps(schedule_list),
            is_active=validated_data.get('is_active', True)
        )
        
        # Enforce single active program constraint
        if new_program.is_active:
            session.query(Program).filter_by(root_id=root_id).update({'is_active': False})
            # The new instance might be in the session dirty / identity map, 
            # but update() is a bulk operation. It's safer to add valid one after or set it explicitly.
            # However, since new_program is not flushed/added yet, the update works on DB.
            # But if we create it with is_active=True, we should ensure it stays True.
        
        session.add(new_program)
        
        # Sync to new tables
        ProgramService._sync_program_structure(session, new_program, schedule_list)
        
        # Flush to get IDs if needed (though UUIDs are generated above)
        
        event_bus.emit(Event(Events.PROGRAM_CREATED, {
            'program_id': new_program.id,
            'program_name': new_program.name,
            'root_id': root_id
        }, source='ProgramService.create_program'))
        
        return serialize_program(new_program)

    @staticmethod
    def update_program(session, root_id: str, program_id: str, validated_data: Dict) -> Optional[Dict]:
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            return None
        
        if 'name' in validated_data:
            program.name = validated_data['name']
        if 'description' in validated_data:
            program.description = validated_data['description']
        if 'start_date' in validated_data:
            program.start_date = datetime.fromisoformat(validated_data['start_date'].replace('Z', '+00:00'))
        if 'end_date' in validated_data:
            program.end_date = datetime.fromisoformat(validated_data['end_date'].replace('Z', '+00:00'))
        if 'selectedGoals' in validated_data:
            program.goal_ids = json.dumps(validated_data['selectedGoals'])
        
        if 'weeklySchedule' in validated_data:
            schedule_list = validated_data['weeklySchedule']
            program.weekly_schedule = json.dumps(schedule_list)
            ProgramService._sync_program_structure(session, program, schedule_list)
            
        if 'is_active' in validated_data:
            program.is_active = validated_data['is_active']
            if program.is_active:
                session.query(Program).filter(
                    Program.root_id == root_id,
                    Program.id != program_id
                ).update({'is_active': False})
        
        event_bus.emit(Event(Events.PROGRAM_UPDATED, {
            'program_id': program.id,
            'program_name': program.name,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='ProgramService.update_program'))
        
        return serialize_program(program)

    @staticmethod
    def delete_program(session, root_id: str, program_id: str) -> Dict:
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
            raise ValueError("Program not found")
        
        # Count sessions
        affected_sessions_count = 0
        for block in program.blocks:
            for day in block.days:
                affected_sessions_count += len([s for s in day.completed_sessions if not s.deleted_at])
        
        program_name = program.name
        session.delete(program)
        
        event_bus.emit(Event(Events.PROGRAM_DELETED, {
            'program_id': program_id,
            'program_name': program_name,
            'root_id': root_id
        }, source='ProgramService.delete_program'))
        
        return {"affected_sessions": affected_sessions_count}

    @staticmethod
    def get_program_session_count(session, root_id: str, program_id: str) -> int:
        program = session.query(Program).filter_by(id=program_id, root_id=root_id).first()
        if not program:
             raise ValueError("Program not found")
        
        count = 0
        for block in program.blocks:
            for day in block.days:
                count += len([s for s in day.completed_sessions if not s.deleted_at])
        return count

    @staticmethod
    def add_block_day(session, root_id: str, program_id: str, block_id: str, data: Dict) -> int:
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")
        
        name = data.get('name')
        template_ids = data.get('template_ids', [])
        if 'template_id' in data and data['template_id']:
            if data['template_id'] not in template_ids:
                template_ids.append(data['template_id'])
        
        day_of_week_raw = data.get('day_of_week')
        day_of_week_list = day_of_week_raw if isinstance(day_of_week_raw, list) else ([day_of_week_raw] if day_of_week_raw else [])
        cascade = data.get('cascade', False)
        
        target_blocks = [block]
        if cascade:
            all_blocks = session.query(ProgramBlock).filter_by(program_id=program_id).all()
            all_blocks.sort(key=lambda b: b.start_date if b.start_date else date.max)
            try:
                idx = next(i for i, b in enumerate(all_blocks) if b.id == block_id)
                target_blocks.extend(all_blocks[idx+1:])
            except StopIteration: pass

        created_count = 0
        
        # Determine the date if provided
        target_date = None
        if data.get('date'):
            dt_str = data.get('date')
            if 'T' in dt_str: dt_str = dt_str.split('T')[0]
            target_date = datetime.strptime(dt_str, '%Y-%m-%d').date()

        for target in target_blocks:
            # Check if a day with this date already exists in this block
            day = None
            if target_date:
                day = session.query(ProgramDay).filter_by(block_id=target.id, date=target_date).first()
            
            if not day:
                count = session.query(ProgramDay).filter_by(block_id=target.id).count()
                day = ProgramDay(
                    id=str(uuid.uuid4()),
                    block_id=target.id,
                    date=target_date,
                    day_number=count + 1,
                    name=name,
                    day_of_week=day_of_week_list
                )
                session.add(day)
            else:
                if name: day.name = name
                day.day_of_week = day_of_week_list
            
            if template_ids:
                templates = session.query(SessionTemplate).filter(SessionTemplate.id.in_(template_ids)).all()
                day.templates = templates
            
            created_count += 1
            
            # Emit event for day creation
            event_bus.emit(Event(Events.PROGRAM_DAY_CREATED, {
                'day_id': day.id,
                'day_name': day.name or f"Day {day.day_number}",
                'block_id': target.id,
                'program_id': program_id,
                'root_id': root_id
            }, source='ProgramService.add_block_day'))
                
        return created_count

    @staticmethod
    def update_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict):
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
             raise ValueError("Day not found")
        
        if 'name' in data: day.name = data['name']
        if 'day_number' in data: day.day_number = data['day_number']
        
        if 'date' in data:
            if data['date']:
                try:
                    dt_str = data['date']
                    if 'T' in dt_str: dt_str = dt_str.split('T')[0]
                    day.date = datetime.strptime(dt_str, '%Y-%m-%d').date()
                except ValueError:
                    raise ValueError("Invalid date format")
            else:
                day.date = None

        if 'day_of_week' in data:
            dows = data['day_of_week']
            if not isinstance(dows, list):
                dows = [dows] if dows else []
            day.day_of_week = dows

        cascade = data.get('cascade', False)
        
        update_sessions = False
        template_ids = data.get('template_ids', [])
        if 'template_ids' in data: update_sessions = True
        
        if 'template_id' in data:
            update_sessions = True
            if data['template_id'] and data['template_id'] not in template_ids:
                 template_ids.append(data['template_id'])

        new_templates = []
        if update_sessions:
            if template_ids:
                new_templates = session.query(SessionTemplate).filter(SessionTemplate.id.in_(template_ids)).all()
            day.templates = new_templates
        
        if cascade:
            all_blocks = session.query(ProgramBlock).filter_by(program_id=program_id).all()
            all_blocks.sort(key=lambda b: b.start_date if b.start_date else date.max)
            try:
                idx = next(i for i, b in enumerate(all_blocks) if b.id == block_id)
                targets = all_blocks[idx+1:]
                
                for target in targets:
                    t_day = session.query(ProgramDay).filter_by(block_id=target.id, day_number=day.day_number).first()
                    if t_day:
                        if 'name' in data: t_day.name = data['name']
                        if update_sessions:
                             t_day.templates = new_templates
            except StopIteration: pass

        event_bus.emit(Event(Events.PROGRAM_DAY_UPDATED, {
            'day_id': day.id,
            'day_name': day.name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='ProgramService.update_block_day'))

    @staticmethod
    def delete_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str):
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")
        
        day_name = day.name # Capture before delete
        session.delete(day)

        event_bus.emit(Event(Events.PROGRAM_DAY_DELETED, {
            'day_id': day_id,
            'day_name': day_name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='ProgramService.delete_block_day'))

    @staticmethod
    def copy_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict) -> int:
        source_day = session.query(ProgramDay).filter_by(id=day_id).first()
        if not source_day:
            raise ValueError("Source day not found")
        
        target_mode = data.get('target_mode', 'all')
        
        query = session.query(ProgramBlock).filter_by(program_id=program_id)
        if target_mode == 'all':
             query = query.filter(ProgramBlock.id != block_id)
        
        target_blocks = query.all()
        copied_count = 0
        
        for target in target_blocks:
             target_day = session.query(ProgramDay).filter_by(block_id=target.id, day_number=source_day.day_number).first()
             
             if not target_day:
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
             
             if source_day.templates:
                  target_day.templates = list(source_day.templates)
             else:
                  target_day.templates = []
             
             copied_count += 1
        
        return copied_count

    @staticmethod
    def get_active_program_days(session, root_id: str) -> List[Dict]:
        today = date.today()
        
        from sqlalchemy.orm import selectinload
        active_programs = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates)
        ).filter_by(
            root_id=root_id,
            is_active=True
        ).all()
        
        result = []
        
        for program in active_programs:
            for block in program.blocks:
                if block.start_date and block.end_date:
                    if block.start_date <= today <= block.end_date:
                        for day in block.days:
                            if day.templates:
                                session_details = []
                                for template in day.templates:
                                    session_details.append({
                                        "template_id": template.id,
                                        "template_name": template.name,
                                        "template_description": template.description,
                                        "template_data": _safe_load_json(template.template_data, {}),
                                        "goals": [serialize_goal(g, include_children=False) for g in template.goals] if hasattr(template, 'goals') else []
                                    })
                                
                                result.append({
                                    "program_id": program.id,
                                    "program_name": program.name,
                                    "block_id": block.id,
                                    "block_name": block.name,
                                    "block_color": block.color,
                                    "block_goal_ids": _safe_load_json(block.goal_ids, []),
                                    "day_id": day.id,
                                    "day_name": day.name,
                                    "day_number": day.day_number,
                                    "day_date": format_utc(day.date),
                                    "goals": [serialize_goal(g, include_children=False) for g in day.goals] if hasattr(day, 'goals') else [],
                                    "is_completed": day.is_completed,
                                    "sessions": session_details,
                                    "completed_session_count": len([s for s in day.completed_sessions if not s.deleted_at])
                                })
        return result

    @staticmethod
    def attach_goal_to_block(session, root_id: str, program_id: str, block_id: str, data: Dict) -> Dict:
        block = session.query(ProgramBlock).filter_by(id=block_id).first()
        if not block:
            raise ValueError("Block not found")
        
        goal_id = data.get('goal_id')
        deadline_str = data.get('deadline')
        
        if not goal_id:
             raise ValueError("Goal ID required")
        
        current_ids = _safe_load_json(block.goal_ids, [])
        if goal_id not in current_ids:
            current_ids.append(goal_id)
            block.goal_ids = json.dumps(current_ids)
            session.add(block)
            
        if deadline_str:
            goal = session.query(Goal).get(goal_id)
            if goal:
                try:
                    if len(deadline_str) > 10: deadline_str = deadline_str[:10]
                    goal.deadline = datetime.strptime(deadline_str, '%Y-%m-%d').date()
                    session.add(goal)
                except ValueError:
                     raise ValueError("Invalid date format")
        
        event_bus.emit(Event(Events.GOAL_BLOCK_ASSOCIATED, {
            'block_id': block.id,
            'block_name': block.name,
            'goal_id': goal_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='ProgramService.attach_goal_to_block'))

        return serialize_program_block(block)

    @staticmethod
    def check_program_day_completion(session, session_id: str) -> bool:
        """
        Check if the completed session fulfills a Program Day.
        If so, mark the day as completed and trigger events.
        """
        completed_session = session.query(Session).filter_by(id=session_id).first()
        if not completed_session:
            return False

        # Extract context
        p_day_id = completed_session.program_day_id
        if not p_day_id and completed_session.attributes:
            try:
                attrs = _safe_load_json(completed_session.attributes, {})
                p_day_id = attrs.get('program_context', {}).get('day_id')
            except: pass

        if not p_day_id:
            return False

        p_day = session.query(ProgramDay).filter_by(id=p_day_id).first()
        if not p_day:
            return False

        # Check if the day is now complete based on all templates
        is_now_complete = p_day.check_completion()
        
        if is_now_complete and not p_day.is_completed:
            p_day.is_completed = True
            logger.info(f"Program Day Completed: {p_day.name} ({p_day.id})")
            
            event_bus.emit(Event(Events.PROGRAM_DAY_COMPLETED, {
                'day_id': p_day.id,
                'day_name': p_day.name,
                'block_id': p_day.block_id,
                'date': format_utc(p_day.date)
            }, source='ProgramService.check_program_day_completion'))
            
            # Check Block Completion
            ProgramService._check_block_completion(session, p_day.block_id)
            
            return True
        
        return False

    @staticmethod
    def _check_block_completion(session, block_id: str):
        block = session.query(ProgramBlock).filter_by(id=block_id).first()
        if not block: return

        # Check all days in block
        # Simple Logic: Are all defined days completed?
        # Note: If days are abstract without dates, this logic holds. 
        # If days are dates, we might only care about past days? 
        # For now, let's assume if all days in the block are marked complete, the block is complete.
        
        all_days = block.days
        if not all_days: return # No days, maybe empty block?

        if all(d.is_completed for d in all_days):
            logger.info(f"Program Block Completed: {block.name}")
            event_bus.emit(Event(Events.PROGRAM_BLOCK_COMPLETED, {
                'block_id': block.id,
                'block_name': block.name,
                'program_id': block.program_id
            }, source='ProgramService._check_block_completion'))

            # Check Program Completion
            ProgramService._check_program_completion(session, block.program_id)

    @staticmethod
    def _check_program_completion(session, program_id: str):
        program = session.query(Program).filter_by(id=program_id).first()
        if not program: return

        # Check all blocks
        # Is every day in every block complete?
        all_blocks_complete = True
        for block in program.blocks:
            if not all(d.is_completed for d in block.days):
                all_blocks_complete = False
                break
        
        if all_blocks_complete:
             logger.info(f"Program Completed: {program.name}")
             event_bus.emit(Event(Events.PROGRAM_COMPLETED, {
                'program_id': program.id,
                'program_name': program.name,
                'root_id': program.root_id
            }, source='ProgramService._check_program_completion'))

