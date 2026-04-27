
import uuid
import logging
from datetime import datetime, timedelta, date, timezone
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from services.serializers import format_utc
from models import (
    Program, ProgramBlock, ProgramDay, ProgramDaySession, Goal, SessionTemplate, Session,
    validate_root_goal, _safe_load_json, program_goals, program_block_goals
)
from services import event_bus, Event, Events
from services.owned_entity_queries import get_owned_program
from services.serializers import serialize_program, serialize_program_block, serialize_program_day, serialize_goal
from services.session_service import SessionService
from services.goal_service import GoalService, sync_goal_targets

logger = logging.getLogger(__name__)


class ProgramServiceValidationError(ValueError):
    def __init__(self, payload: Any, status_code: int = 400):
        self.payload = payload
        self.status_code = status_code
        if isinstance(payload, dict):
            message = payload.get('error') or payload.get('message') or str(payload)
        else:
            message = str(payload)
        super().__init__(message)

class ProgramService:
    """
    Service for managing training programs, blocks, and days.
    """

    @staticmethod
    def _require_root_access(session, root_id: str, current_user_id: str | None = None):
        root = validate_root_goal(session, root_id, owner_id=current_user_id) if current_user_id else validate_root_goal(session, root_id)
        if not root:
            raise ValueError("Fractal not found or access denied")
        return root

    @staticmethod
    def _commit(session, *instances):
        session.commit()
        for instance in instances:
            if instance is not None:
                session.refresh(instance)

    @staticmethod
    def _queue_or_emit_event(pending_events, event):
        if pending_events is None:
            event_bus.emit(event)
            return
        pending_events.append(event)

    @staticmethod
    def _parse_optional_block_date(data: Dict[str, Any], snake_key: str, camel_key: str):
        raw_value = data.get(snake_key)
        if raw_value is None:
            raw_value = data.get(camel_key)
        if not raw_value:
            return None

        try:
            return datetime.strptime(str(raw_value)[:10], '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Invalid {snake_key} format")

    @staticmethod
    def _parse_required_date(raw_value: Any, field_name: str = 'date') -> date:
        if not raw_value:
            raise ValueError(f"{field_name} is required")

        try:
            return datetime.strptime(str(raw_value)[:10], '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Invalid {field_name} format")

    @staticmethod
    def _parse_program_datetime(raw_value: Any, field_name: str) -> datetime:
        if not raw_value:
            raise ValueError(f"{field_name} is required")
        if isinstance(raw_value, datetime):
            return raw_value
        if isinstance(raw_value, date):
            return datetime.combine(raw_value, datetime.min.time())
        try:
            return datetime.fromisoformat(str(raw_value).replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f"Invalid {field_name} format")

    @staticmethod
    def _date_part(value: Any) -> date | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return ProgramService._parse_program_datetime(value, 'date').date()

    @staticmethod
    def _check_no_program_overlap(
        session,
        root_id: str,
        start_date_value: Any,
        end_date_value: Any,
        exclude_program_id: str | None = None,
    ):
        start_date = ProgramService._date_part(start_date_value)
        end_date = ProgramService._date_part(end_date_value)
        if not start_date or not end_date:
            return

        overlapping_query = session.query(Program).filter(
            Program.root_id == root_id,
            Program.start_date <= end_date,
            Program.end_date >= start_date,
        )
        if exclude_program_id:
            overlapping_query = overlapping_query.filter(Program.id != exclude_program_id)

        overlapping_program = overlapping_query.first()
        if overlapping_program:
            raise ValueError(
                f"Programs cannot overlap in date range. "
                f"Conflicts with {overlapping_program.name} "
                f"({ProgramService._date_part(overlapping_program.start_date)} to "
                f"{ProgramService._date_part(overlapping_program.end_date)})."
            )

    @staticmethod
    def _normalize_deadline_value(raw_value: Any) -> str:
        if not raw_value:
            raise ValueError("deadline is required")
        return str(raw_value)[:10]

    @staticmethod
    def _normalize_goal_date(value: Any) -> date | None:
        if value is None:
            return None
        return value.date() if isinstance(value, datetime) else value

    @staticmethod
    def _collect_goal_descendant_ids(session, root_id: str, seed_goal_ids: List[str]) -> set[str]:
        normalized_seed_ids = list(dict.fromkeys(seed_goal_ids or []))
        if not normalized_seed_ids:
            return set()

        goal_rows = session.query(Goal.id, Goal.parent_id).filter(
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).all()

        children_by_parent: Dict[str | None, List[str]] = {}
        for goal_id, parent_id in goal_rows:
            children_by_parent.setdefault(parent_id, []).append(goal_id)

        visited: set[str] = set()
        stack = list(normalized_seed_ids)
        while stack:
            goal_id = stack.pop()
            if not goal_id or goal_id in visited:
                continue
            visited.add(goal_id)
            stack.extend(children_by_parent.get(goal_id, []))

        return visited

    @staticmethod
    def _program_scope_goal_ids(session, program: Program, root_id: str) -> set[str]:
        return ProgramService._collect_goal_descendant_ids(
            session,
            root_id,
            [goal.id for goal in (program.goals or [])],
        )

    @staticmethod
    def _program_allowed_goal_ids(session, program: Program, root_id: str) -> set[str]:
        scope_goal_ids = ProgramService._program_scope_goal_ids(session, program, root_id)
        block_goal_ids = {
            goal.id
            for block in (program.blocks or [])
            for goal in (block.goals or [])
        }
        return scope_goal_ids | block_goal_ids

    @staticmethod
    def _validate_goal_in_program_scope(session, program: Program, root_id: str, goal_id: str):
        allowed_goal_ids = ProgramService._program_allowed_goal_ids(session, program, root_id)
        if not allowed_goal_ids:
            raise ValueError("Program scope is empty. Select medium or long term goals on the program first.")
        if goal_id not in allowed_goal_ids:
            raise ValueError("Goal must be within the configured program scope")

    @staticmethod
    def _apply_goal_deadline_with_program_rules(session, root_id: str, current_user_id: str | None, goal: Goal, deadline_value: str):
        goal_service = GoalService(session, sync_targets=sync_goal_targets)
        _, update_error = goal_service._apply_goal_updates(
            goal,
            {'deadline': deadline_value},
            root_id=root_id,
            allow_parent_update=False,
            allow_extended_fields=False,
        )
        if update_error:
            error_payload, status_code = update_error
            raise ProgramServiceValidationError(error_payload, status_code)

        session.add(goal)

    @staticmethod
    def _replace_program_goals(session, program_id: str, goal_ids: List[str], root_id: str) -> List[Goal]:
        goal_ids = list(dict.fromkeys(goal_ids or []))
        goals = []
        if goal_ids:
            goals = session.query(Goal).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).all()
            found_ids = {g.id for g in goals}
            missing_ids = [gid for gid in goal_ids if gid not in found_ids]
            if missing_ids:
                raise ValueError(f"Goals not found in this fractal: {', '.join(missing_ids)}")

        session.execute(
            program_goals.delete().where(program_goals.c.program_id == program_id)
        )
        if goals:
            session.execute(
                program_goals.insert(),
                [{'program_id': program_id, 'goal_id': g.id} for g in goals]
            )
        return goals

    @staticmethod
    def _replace_block_goals(session, block_id: str, goal_ids: List[str], root_id: str):
        goal_ids = list(dict.fromkeys(goal_ids or []))
        goals = []
        if goal_ids:
            goals = session.query(Goal).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).all()
            found_ids = {g.id for g in goals}
            missing_ids = [gid for gid in goal_ids if gid not in found_ids]
            if missing_ids:
                raise ValueError(f"Goals not found in this fractal: {', '.join(missing_ids)}")

        session.execute(
            program_block_goals.delete().where(program_block_goals.c.program_block_id == block_id)
        )
        if goals:
            session.execute(
                program_block_goals.insert(),
                [{'program_block_id': block_id, 'goal_id': g.id} for g in goals]
            )
        return goals

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
    def get_programs(session, root_id: str, current_user_id: str | None = None) -> List[Dict]:
        ProgramService._require_root_access(session, root_id, current_user_id)

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
    def get_program(session, root_id: str, program_id: str, current_user_id: str | None = None) -> Optional[Dict]:
        ProgramService._require_root_access(session, root_id, current_user_id)

        from sqlalchemy.orm import selectinload
        program = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates),
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.completed_sessions)
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None
        
        return serialize_program(program)

    @staticmethod
    def create_block(session, root_id: str, program_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        start_date_val = ProgramService._parse_optional_block_date(data, 'start_date', 'startDate')
        end_date_val = ProgramService._parse_optional_block_date(data, 'end_date', 'endDate')

        new_block = ProgramBlock(
            program_id=program.id,
            name=data['name'],
            start_date=start_date_val,
            end_date=end_date_val,
            color=data.get('color')
        )
        session.add(new_block)
        session.flush() # Get ID

        if data.get('goal_ids'):
            ProgramService._replace_block_goals(session, new_block.id, data['goal_ids'], root_id)

        ProgramService._commit(session, new_block)
        event_bus.emit(Event(Events.PROGRAM_BLOCK_CREATED, {
            'block_id': new_block.id,
            'block_name': new_block.name,
            'program_id': program_id,
            'root_id': root_id,
        }, source='ProgramService.create_block'))
        return serialize_program_block(new_block)

    @staticmethod
    def update_block(session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program.id).first()
        if not block:
            raise ValueError("Block not found")

        if 'name' in data:
            block.name = data['name']
        if 'color' in data:
            block.color = data['color']
            
        if 'start_date' in data or 'startDate' in data:
            block.start_date = ProgramService._parse_optional_block_date(data, 'start_date', 'startDate')
        if 'end_date' in data or 'endDate' in data:
            block.end_date = ProgramService._parse_optional_block_date(data, 'end_date', 'endDate')

        if 'goal_ids' in data:
            ProgramService._replace_block_goals(session, block.id, data['goal_ids'], root_id)
            session.expire(block, ['goals'])

        ProgramService._commit(session, block)
        event_bus.emit(Event(Events.PROGRAM_BLOCK_UPDATED, {
            'block_id': block.id,
            'block_name': block.name,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
        }, source='ProgramService.update_block'))
        return serialize_program_block(block)

    @staticmethod
    def delete_block(session, root_id: str, program_id: str, block_id: str, current_user_id: str | None = None):
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program.id).first()
        if not block:
            raise ValueError("Block not found")

        session.delete(block)
        ProgramService._commit(session)

    @staticmethod
    def create_program(session, root_id: str, validated_data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        
        # Parse dates
        start_date = ProgramService._parse_program_datetime(validated_data['start_date'], 'start_date')
        end_date = ProgramService._parse_program_datetime(validated_data['end_date'], 'end_date')
        ProgramService._check_no_program_overlap(session, root_id, start_date, end_date)
        
        schedule_list = validated_data.get('weeklySchedule', [])
        
        new_program = Program(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name=validated_data['name'],
            description=validated_data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            weekly_schedule=schedule_list,
        )
        
        goal_ids = validated_data.get('selectedGoals', [])

        session.add(new_program)
        session.flush()
        ProgramService._replace_program_goals(session, new_program.id, goal_ids, root_id)
        
        # Sync to new tables
        ProgramService._sync_program_structure(session, new_program, schedule_list)
        
        ProgramService._commit(session, new_program)

        event_bus.emit(Event(Events.PROGRAM_CREATED, {
            'program_id': new_program.id,
            'program_name': new_program.name,
            'root_id': root_id
        }, source='ProgramService.create_program'))
        
        return serialize_program(new_program)

    @staticmethod
    def update_program(session, root_id: str, program_id: str, validated_data: Dict, current_user_id: str | None = None) -> Optional[Dict]:
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            return None

        next_start_date = ProgramService._parse_program_datetime(
            validated_data.get('start_date', program.start_date),
            'start_date',
        )
        next_end_date = ProgramService._parse_program_datetime(
            validated_data.get('end_date', program.end_date),
            'end_date',
        )
        if 'start_date' in validated_data or 'end_date' in validated_data:
            ProgramService._check_no_program_overlap(
                session,
                root_id,
                next_start_date,
                next_end_date,
                exclude_program_id=program_id,
            )
        
        if 'name' in validated_data:
            program.name = validated_data['name']
        if 'description' in validated_data:
            program.description = validated_data['description']
        if 'start_date' in validated_data:
            program.start_date = next_start_date
        if 'end_date' in validated_data:
            program.end_date = next_end_date
        if 'selectedGoals' in validated_data:
            goal_ids = validated_data['selectedGoals']
            ProgramService._replace_program_goals(session, program.id, goal_ids, root_id)
        
        if 'weeklySchedule' in validated_data:
            schedule_list = validated_data['weeklySchedule']
            program.weekly_schedule = schedule_list
            ProgramService._sync_program_structure(session, program, schedule_list)
            
        ProgramService._commit(session, program)
        
        event_bus.emit(Event(Events.PROGRAM_UPDATED, {
            'program_id': program.id,
            'program_name': program.name,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='ProgramService.update_program'))
        
        return serialize_program(program)

    @staticmethod
    def delete_program(session, root_id: str, program_id: str, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")
        
        # Count sessions
        affected_sessions_count = 0
        for block in program.blocks:
            for day in block.days:
                affected_sessions_count += len([s for s in day.completed_sessions if not s.deleted_at])
        
        program_name = program.name
        session.delete(program)
        ProgramService._commit(session)
        
        event_bus.emit(Event(Events.PROGRAM_DELETED, {
            'program_id': program_id,
            'program_name': program_name,
            'root_id': root_id
        }, source='ProgramService.delete_program'))
        
        return {"affected_sessions": affected_sessions_count}

    @staticmethod
    def get_program_session_count(session, root_id: str, program_id: str, current_user_id: str | None = None) -> int:
        ProgramService._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
             raise ValueError("Program not found")
        
        count = 0
        for block in program.blocks:
            for day in block.days:
                count += len([s for s in day.completed_sessions if not s.deleted_at])
        return count

    @staticmethod
    def add_block_day(session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        ProgramService._require_root_access(session, root_id, current_user_id)
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")
        
        name = data.get('name')
        template_ids = data.get('template_ids', [])
        note_condition = bool(data.get('note_condition', False))
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
                    note_condition=note_condition,
                )
                session.add(day)
            else:
                if name: day.name = name
                day.day_of_week = day_of_week_list
                if 'note_condition' in data:
                    day.note_condition = note_condition
            
            if template_ids:
                templates = session.query(SessionTemplate).filter(SessionTemplate.id.in_(template_ids)).all()
                day.templates = templates
            
            created_count += 1
            touched_days.append(day)
            emitted_days.append({
                'day_id': day.id,
                'day_name': day.name or f"Day {day.day_number}",
                'block_id': target.id,
                'program_id': program_id,
                'root_id': root_id,
            })

        ProgramService._commit(session)
        for event_payload in emitted_days:
            event_bus.emit(Event(Events.PROGRAM_DAY_CREATED, event_payload, source='ProgramService.add_block_day'))
        return {
            "days": [serialize_program_day(day) for day in touched_days],
            "count": created_count,
        }

    @staticmethod
    def update_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
             raise ValueError("Day not found")
        
        if 'name' in data: day.name = data['name']
        if 'day_number' in data: day.day_number = data['day_number']
        if 'note_condition' in data: day.note_condition = bool(data['note_condition'])
        
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

        ProgramService._commit(session, day)

        event_bus.emit(Event(Events.PROGRAM_DAY_UPDATED, {
            'day_id': day.id,
            'day_name': day.name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='ProgramService.update_block_day'))

        return serialize_program_day(day)

    @staticmethod
    def delete_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, current_user_id: str | None = None):
        ProgramService._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")
        
        day_name = day.name # Capture before delete
        session.delete(day)
        ProgramService._commit(session)

        event_bus.emit(Event(Events.PROGRAM_DAY_DELETED, {
            'day_id': day_id,
            'day_name': day_name,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='ProgramService.delete_block_day'))

    @staticmethod
    def copy_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        ProgramService._require_root_access(session, root_id, current_user_id)
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
             copied_days.append(target_day)
        
        ProgramService._commit(session)
        return {
            "days": [serialize_program_day(day) for day in copied_days],
            "count": copied_count,
        }

    @staticmethod
    def schedule_block_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)

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
        }, source='ProgramService.schedule_block_day'))
        return scheduled_session

    @staticmethod
    def unschedule_block_day_occurrence(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        ProgramService._require_root_access(session, root_id, current_user_id)

        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")

        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day:
            raise ValueError("Day not found")

        target_date = ProgramService._parse_required_date(data.get('date'), 'date')
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

        ProgramService._commit(session)

        for session_id in removed_session_ids:
            event_bus.emit(Event(Events.SESSION_DELETED, {
                'session_id': session_id,
                'session_name': removed_session_names.get(session_id),
                'root_id': root_id
            }, source='ProgramService.unschedule_block_day_occurrence'))

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
            }, source='ProgramService.unschedule_block_day_occurrence'))

        return {
            "day": serialize_program_day(day),
            "removed_session_ids": removed_session_ids,
            "removed_count": len(removed_session_ids),
        }

    @staticmethod
    def set_goal_deadline_for_program_date(session, root_id: str, program_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)

        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        goal_id = data.get('goal_id')
        if not goal_id:
            raise ValueError("Goal ID required")

        deadline_value = ProgramService._normalize_deadline_value(data.get('deadline'))
        deadline_date = ProgramService._parse_required_date(deadline_value, 'deadline')
        program_start = ProgramService._normalize_goal_date(program.start_date)
        program_end = ProgramService._normalize_goal_date(program.end_date)
        if program_start and deadline_date < program_start or program_end and deadline_date > program_end:
            raise ValueError("Goal deadline must be within the program date range")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        ProgramService._validate_goal_in_program_scope(session, program, root_id, goal_id)
        ProgramService._apply_goal_deadline_with_program_rules(session, root_id, current_user_id, goal, deadline_value)

        ProgramService._commit(session, goal)
        return serialize_goal(goal, include_children=False)

    @staticmethod
    def get_active_program_days(session, root_id: str, current_user_id: str | None = None) -> List[Dict]:
        ProgramService._require_root_access(session, root_id, current_user_id)
        today = date.today()
        
        from sqlalchemy.orm import selectinload
        active_programs = session.query(Program).options(
            selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.templates)
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
                            if day.templates:
                                session_details = []
                                for template in day.templates:
                                    session_details.append({
                                        "template_id": template.id,
                                        "template_name": template.name,
                                        "template_description": template.description,
                                        "template_data": _safe_load_json(template.template_data, {})
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
                                    "sessions": session_details,
                                    "completed_session_count": len([s for s in day.completed_sessions if not s.deleted_at])
                                })
        return result

    @staticmethod
    def attach_goal_to_day(session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        """Attach a single goal to a specific program day."""
        ProgramService._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day or day.block.program_id != program_id:
            raise ValueError("Program Day not found")

        goal_id = data.get('goal_id')
        if not goal_id:
             raise ValueError("Goal ID required")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        # Insert directly into program_day_goals junction
        from models.goal import program_day_goals
        from sqlalchemy.exc import IntegrityError
        
        # Check if already attached to avoid IntegrityError triggering overall rollback
        existing = session.execute(
            program_day_goals.select().where(
                (program_day_goals.c.program_day_id == day_id) &
                (program_day_goals.c.goal_id == goal_id)
            )
        ).first()
        
        if existing:
            logger.debug(f"Goal {goal_id} already attached to day {day_id}")
            return serialize_program_day(day)
            
        stmt = program_day_goals.insert().values(
            program_day_id=day_id,
            goal_id=goal_id
        )
        
        try:
            # Use nested transaction for safe concurrency handling
            with session.begin_nested():
                session.execute(stmt)
        except IntegrityError:
            # Goal already attached to this day concurrently — idempotent
            logger.debug(f"Goal {goal_id} already attached to day {day_id} (concurrent)")
            return serialize_program_day(day)

        session.expire(day, ['goals'])
        ProgramService._commit(session, day)

        event_bus.emit(Event(Events.GOAL_DAY_ASSOCIATED, {
            'day_id': day.id,
            'day_name': day.name,
            'goal_id': goal_id,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='ProgramService.attach_goal_to_day'))

        return serialize_program_day(day)

    @staticmethod
    def attach_goal_to_block(session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        ProgramService._require_root_access(session, root_id, current_user_id)
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found in this fractal")
        
        goal_id = data.get('goal_id')
        deadline_str = ProgramService._normalize_deadline_value(data.get('deadline'))
        deadline_date = ProgramService._parse_required_date(deadline_str, 'deadline')
        
        if not goal_id:
             raise ValueError("Goal ID required")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        if block.start_date is None or block.end_date is None:
            raise ValueError("Block must have a start and end date before goals can be attached")

        if deadline_date < block.start_date or deadline_date > block.end_date:
            raise ValueError("Goal deadline must be within the selected block date range")

        current_block_goal_ids = [g.id for g in (block.goals or [])]
        scope_goal_ids = ProgramService._program_scope_goal_ids(session, program, root_id)
        if not scope_goal_ids:
            raise ValueError("Program scope is empty. Select medium or long term goals on the program first.")
        if goal.id not in scope_goal_ids and goal.id not in current_block_goal_ids:
            raise ValueError("Goal must be within the configured program scope")
        if goal.id not in current_block_goal_ids:
            ProgramService._replace_block_goals(
                session, block.id, current_block_goal_ids + [goal.id], root_id
            )
            session.expire(block, ['goals'])

        ProgramService._apply_goal_deadline_with_program_rules(session, root_id, current_user_id, goal, deadline_str)

        ProgramService._commit(session, block)
        
        event_bus.emit(Event(Events.GOAL_BLOCK_ASSOCIATED, {
            'block_id': block.id,
            'block_name': block.name,
            'goal_id': goal_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='ProgramService.attach_goal_to_block'))

        return serialize_program_block(block)

    @staticmethod
    def check_program_day_completion(session, session_id: str, pending_events=None) -> bool:
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

        # Record the session explicitly
        if completed_session.template_id:
            day_session = ProgramDaySession(
                program_day_id=p_day.id,
                session_template_id=completed_session.template_id,
                session_id=session_id,
                execution_status='completed'
            )
            session.add(day_session)

        # Check if the day is now complete based on all templates
        is_now_complete = p_day.check_completion()
        
        if is_now_complete and not p_day.is_completed:
            p_day.is_completed = True
            logger.info(f"Program Day Completed: {p_day.name} ({p_day.id})")
            
            ProgramService._queue_or_emit_event(pending_events, Event(Events.PROGRAM_DAY_COMPLETED, {
                'day_id': p_day.id,
                'day_name': p_day.name,
                'block_id': p_day.block_id,
                'root_id': p_day.block.program.root_id if p_day.block and p_day.block.program else completed_session.root_id,
                'date': format_utc(p_day.date)
            }, source='ProgramService.check_program_day_completion'))
            
            # Check Block Completion
            ProgramService._check_block_completion(session, p_day.block_id, pending_events=pending_events)
            
            return True
        
        return False

    @staticmethod
    def _check_block_completion(session, block_id: str, pending_events=None):
        block = session.query(ProgramBlock).filter_by(id=block_id).first()
        if not block: return

        # Check all days in block
        # Simple Logic: Are all defined days completed?
        # Note: If days are abstract without dates, this logic holds. 
        # If days are dates, we might only care about past days? 
        # For now, let's assume if all days in the block are marked complete, the block is complete.
        
        all_days = block.days
        if not all_days: return # No days, maybe empty block?

        if all_days and all(d.is_completed for d in all_days):
            if not block.is_completed:
                block.is_completed = True
                logger.info(f"Program Block Completed: {block.name}")
                ProgramService._queue_or_emit_event(pending_events, Event(Events.PROGRAM_BLOCK_COMPLETED, {
                    'block_id': block.id,
                    'block_name': block.name,
                    'program_id': block.program_id,
                    'root_id': block.program.root_id if block.program else None,
                }, source='ProgramService._check_block_completion'))

            # Check Program Completion
            ProgramService._check_program_completion(session, block.program_id, pending_events=pending_events)
        else:
            if block.is_completed:
                block.is_completed = False

    @staticmethod
    def _check_program_completion(session, program_id: str, pending_events=None):
        program = session.query(Program).filter_by(id=program_id).first()
        if not program: return

        # Check all blocks
        # Is every day in every block complete?
        all_blocks_complete = True
        for block in program.blocks:
            if not block.days:
                all_blocks_complete = False
                break
            if not all(d.is_completed for d in block.days):
                all_blocks_complete = False
                break
        
        if all_blocks_complete:
            if not program.is_completed:
                 program.is_completed = True
                 logger.info(f"Program Completed: {program.name}")
                 ProgramService._queue_or_emit_event(pending_events, Event(Events.PROGRAM_COMPLETED, {
                    'program_id': program.id,
                    'program_name': program.name,
                    'root_id': program.root_id
                }, source='ProgramService._check_program_completion'))
        else:
            if program.is_completed:
                program.is_completed = False
