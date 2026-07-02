"""Block-day lifecycle: add/update/delete/copy/schedule/unschedule + deadlines.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import uuid
import logging
from datetime import datetime, date, timezone
from typing import List, Dict, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from services.serializers import format_utc
from models import Program, ProgramBlock, ProgramDay, ProgramDayTemplate, Goal, Session, _safe_load_json
from services import event_bus, Event, Events
from services.owned_entity_queries import get_owned_program
from services.serializers import serialize_program_day, serialize_goal
from services.session_service import SessionService

logger = logging.getLogger(__name__)


class _ProgramDaysMixin:
    @classmethod
    def add_block_day(cls, session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")
        
        name = data.get('name')
        template_configs = cls._normalize_template_configs(data)
        
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
        emitted_days = []
        touched_days: List[ProgramDay] = []
        
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
                    day_of_week=day_of_week_list,
                    completion_min_templates=data.get('completion_min_templates'),
                )
                session.add(day)
                session.flush()
            else:
                if name: day.name = name
                day.day_of_week = day_of_week_list
                if 'completion_min_templates' in data:
                    day.completion_min_templates = data.get('completion_min_templates')
            
            if 'template_configs' in data or 'template_ids' in data or 'template_id' in data:
                cls._apply_program_day_template_configs(session, day, template_configs)
            cls._validate_program_day_completion_min(day)
            
            created_count += 1
            touched_days.append(day)
            emitted_days.append({
                'day_id': day.id,
                'day_name': day.name or f"Day {day.day_number}",
                'block_id': target.id,
                'program_id': program_id,
                'root_id': root_id,
            })

        cls._commit(session)
        for event_payload in emitted_days:
            event_bus.emit(Event(Events.PROGRAM_DAY_CREATED, event_payload, source='cls.add_block_day'))
        return {
            "days": [serialize_program_day(day) for day in touched_days],
            "count": created_count,
        }

    @classmethod
    def update_block_day(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
             raise ValueError("Day not found")
        
        if 'name' in data: day.name = data['name']
        if 'day_number' in data: day.day_number = data['day_number']
        if 'completion_min_templates' in data:
            day.completion_min_templates = data.get('completion_min_templates')
        
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
        if 'template_configs' in data or 'template_ids' in data or 'template_id' in data:
            update_sessions = True
            template_configs = cls._normalize_template_configs(data)

        if update_sessions:
            cls._apply_program_day_template_configs(session, day, template_configs)
        cls._validate_program_day_completion_min(day)
        
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
                        if 'completion_min_templates' in data:
                            t_day.completion_min_templates = data.get('completion_min_templates')
                        if update_sessions:
                            cls._apply_program_day_template_configs(session, t_day, template_configs)
                        cls._validate_program_day_completion_min(t_day)
            except StopIteration: pass

        cls._commit(session, day)

        event_bus.emit(Event(Events.PROGRAM_DAY_UPDATED, {
            'day_id': day.id,
            'day_name': day.name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='cls.update_block_day'))

        return serialize_program_day(day)

    @classmethod
    def delete_block_day(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, current_user_id: str | None = None):
        cls._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")
        
        day_name = day.name # Capture before delete
        session.delete(day)
        cls._commit(session)

        event_bus.emit(Event(Events.PROGRAM_DAY_DELETED, {
            'day_id': day_id,
            'day_name': day_name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='cls.delete_block_day'))

    @classmethod
    def copy_block_day(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)
        source_day = session.query(ProgramDay).filter_by(id=day_id).first()
        if not source_day:
            raise ValueError("Source day not found")
        
        target_mode = data.get('target_mode', 'all')
        
        query = session.query(ProgramBlock).filter_by(program_id=program_id)
        if target_mode == 'all':
             query = query.filter(ProgramBlock.id != block_id)
        
        target_blocks = query.all()
        copied_count = 0
        copied_days: List[ProgramDay] = []
        
        for target in target_blocks:
             target_day = session.query(ProgramDay).filter_by(block_id=target.id, day_number=source_day.day_number).first()
             
             if not target_day:
                  target_day = ProgramDay(
                      id=str(uuid.uuid4()),
                      block_id=target.id,
                      day_number=source_day.day_number,
                      name=source_day.name,
                      date=None,
                      day_of_week=source_day.day_of_week,
                      completion_min_templates=source_day.completion_min_templates,
                  )
                  session.add(target_day)
                  session.flush()
             else:
                  target_day.name = source_day.name
                  target_day.day_of_week = source_day.day_of_week
                  target_day.completion_min_templates = source_day.completion_min_templates
             
             source_configs = [
                 {
                     'template_id': link.session_template_id,
                     'is_required': bool(link.is_required),
                     'order': link.order or index,
                 }
                 for index, link in enumerate(source_day.template_links or [])
             ] or [
                 {'template_id': template.id, 'is_required': True, 'order': index}
                 for index, template in enumerate(source_day.templates or [])
             ]
             cls._apply_program_day_template_configs(session, target_day, source_configs)
             
             copied_count += 1
             copied_days.append(target_day)
        
        cls._commit(session)
        return {
            "days": [serialize_program_day(day) for day in copied_days],
            "count": copied_count,
        }

    @classmethod
    def schedule_block_day(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)

        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")

        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")

        session_start = data.get('session_start')
        if not session_start:
            raise ValueError("session_start is required")
        try:
            normalized_session_start = datetime.fromisoformat(str(session_start).replace('Z', '+00:00'))
        except ValueError:
            raise ValueError("Invalid session_start format")

        scheduled_date = normalized_session_start.date()
        if (
            block.start_date is not None and scheduled_date < block.start_date
        ) or (
            block.end_date is not None and scheduled_date > block.end_date
        ):
            raise ValueError("Scheduled date must be within the selected block date range")

        parent_ids = list(dict.fromkeys([
            *[goal.id for goal in (block.goals or [])],
            *[goal.id for goal in (program.goals or [])],
        ]))
        if not parent_ids:
            parent_ids = [root_id]

        session_payload = {
            'name': day.name or f'Day {day.day_number or 1}',
            'session_start': session_start,
            'parent_ids': parent_ids,
            'session_data': {
                'program_context': {
                    'day_id': day.id,
                    'block_id': block.id,
                    'program_id': program.id,
                }
            }
        }

        scheduled_session, error_message, status_code = SessionService(session).create_session(
            root_id,
            current_user_id,
            session_payload,
        )
        if error_message:
            raise ValueError(error_message)

        if status_code != 201 or scheduled_session is None:
            raise ValueError("Failed to schedule program day")

        scheduled_session_id = (
            scheduled_session.get('id')
            if isinstance(scheduled_session, dict)
            else getattr(scheduled_session, 'id', None)
        )
        scheduled_session_name = (
            scheduled_session.get('name')
            if isinstance(scheduled_session, dict)
            else getattr(scheduled_session, 'name', None)
        )
        event_bus.emit(Event(Events.PROGRAM_DAY_SCHEDULED, {
            'day_id': day.id,
            'day_name': day.name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id,
            'scheduled_date': scheduled_date.isoformat(),
            'session_id': scheduled_session_id,
            'session_name': scheduled_session_name,
        }, source='cls.schedule_block_day'))
        return scheduled_session

    @classmethod
    def unschedule_block_day_occurrence(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)

        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")

        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")

        target_date = cls._parse_required_date(data.get('date'), 'date')
        timezone_name = data.get('timezone') or 'UTC'
        try:
            zone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            raise ValueError("Invalid timezone")

        def get_session_program_day_id(session_obj: Session) -> str | None:
            if session_obj.program_day_id:
                return session_obj.program_day_id
            attrs = _safe_load_json(getattr(session_obj, 'attributes', None), {})
            return attrs.get('program_context', {}).get('day_id')

        candidate_sessions = session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
            Session.completed == False,
        ).all()

        removed_session_ids: List[str] = []
        removed_session_names: Dict[str, str] = {}
        for scheduled_session in candidate_sessions:
            if get_session_program_day_id(scheduled_session) != day_id:
                continue

            session_dt = scheduled_session.session_start or scheduled_session.created_at
            if session_dt is None:
                continue
            if session_dt.tzinfo is None:
                session_dt = session_dt.replace(tzinfo=timezone.utc)

            if session_dt.astimezone(zone).date() != target_date:
                continue

            scheduled_session.deleted_at = datetime.now(timezone.utc)
            removed_session_ids.append(scheduled_session.id)
            removed_session_names[scheduled_session.id] = scheduled_session.name

        cls._commit(session)

        for session_id in removed_session_ids:
            event_bus.emit(Event(Events.SESSION_DELETED, {
                'session_id': session_id,
                'session_name': removed_session_names.get(session_id),
                'root_id': root_id
            }, source='cls.unschedule_block_day_occurrence'))

        if removed_session_ids:
            event_bus.emit(Event(Events.PROGRAM_DAY_UNSCHEDULED, {
                'day_id': day.id,
                'day_name': day.name,
                'block_id': block_id,
                'program_id': program_id,
                'root_id': root_id,
                'date': target_date.isoformat(),
                'removed_session_ids': removed_session_ids,
                'removed_count': len(removed_session_ids),
            }, source='cls.unschedule_block_day_occurrence'))

        return {
            "day": serialize_program_day(day),
            "removed_session_ids": removed_session_ids,
            "removed_count": len(removed_session_ids),
        }

    @classmethod
    def set_goal_deadline_for_program_date(cls, session, root_id: str, program_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)

        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        goal_id = data.get('goal_id')
        if not goal_id:
            raise ValueError("Goal ID required")

        deadline_value = cls._normalize_deadline_value(data.get('deadline'))
        deadline_date = cls._parse_required_date(deadline_value, 'deadline')
        program_start = cls._normalize_goal_date(program.start_date)
        program_end = cls._normalize_goal_date(program.end_date)
        if program_start and deadline_date < program_start or program_end and deadline_date > program_end:
            raise ValueError("Goal deadline must be within the program date range")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        cls._validate_goal_in_program_scope(session, program, root_id, goal_id)
        cls._apply_goal_deadline_with_program_rules(session, root_id, current_user_id, goal, deadline_value)

        cls._commit(session, goal)
        return serialize_goal(goal, include_children=False)

    @classmethod
    def get_active_program_days(cls, session, root_id: str, current_user_id: str | None = None) -> List[Dict]:
        cls._require_root_access(session, root_id, current_user_id)
        today = date.today()
        
        from sqlalchemy.orm import selectinload
        active_programs = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates),
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.template_links)
                .selectinload(ProgramDayTemplate.template)
        ).filter(
            Program.root_id == root_id,
            Program.start_date <= today,
            Program.end_date >= today,
        ).all()
        
        result = []
        
        for program in active_programs:
            for block in program.blocks:
                if block.start_date and block.end_date:
                    if block.start_date <= today <= block.end_date:
                        for day in block.days:
                            if day.templates and cls._program_day_scheduled_on(day, block, today):
                                session_details = []
                                template_rules = {
                                    link.session_template_id: {
                                        "is_required": bool(link.is_required),
                                        "order": link.order or 0,
                                    }
                                    for link in (day.template_links or [])
                                }
                                for index, template in enumerate(day.templates):
                                    template_rule = template_rules.get(template.id, {})
                                    session_details.append({
                                        "template_id": template.id,
                                        "template_name": template.name,
                                        "template_description": template.description,
                                        "template_data": _safe_load_json(template.template_data, {}),
                                        "is_archived": bool(getattr(template, "archived_at", None)),
                                        "archived_at": format_utc(getattr(template, "archived_at", None)),
                                        "is_used_in_active_program": True,
                                        "is_effectively_active": True,
                                        "is_required": template_rule.get("is_required", True),
                                        "order": template_rule.get("order", index),
                                    })
                                
                                result.append({
                                    "program_id": program.id,
                                    "program_name": program.name,
                                    "block_id": block.id,
                                    "block_name": block.name,
                                    "block_color": block.color,
                                    "program_goal_ids": [g.id for g in program.goals],
                                    "block_goal_ids": [g.id for g in block.goals],
                                    "day_id": day.id,
                                    "day_name": day.name,
                                    "day_number": day.day_number,
                                    "day_date": format_utc(day.date),
                                    "is_completed": day.is_completed,
                                    "completion_min_templates": day.completion_min_templates,
                                    "sessions": session_details,
                                    "completed_session_count": len([s for s in day.completed_sessions if not s.deleted_at])
                                })
        return result
