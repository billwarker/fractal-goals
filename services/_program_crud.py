"""Program and block CRUD.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import uuid
import logging
from typing import List, Dict, Optional


from models import Program, ProgramBlock
from services import event_bus, Event, Events
from services.owned_entity_queries import get_owned_program
from services.quota_service import QuotaService
from services.serializers import serialize_program, serialize_program_block
from services.program_scope import resolve_program_scope, resolve_program_scopes
from services.program_focus import guard_program_goal_change, resolve_focus_scopes
from services._serialize_common import format_utc
from services.program_calendar_invariants import (
    assert_block_dates_valid,
    assert_blocks_within_program,
    assert_no_block_overlap,
    assert_single_program_day_per_date,
    flush_block_dates,
    lock_program_calendar,
)

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Mixins resolve shared helpers through the composed ProgramService.
    from services._program_helpers import _ProgramHelpersMixin as _ProgramMixinBase
else:
    _ProgramMixinBase = object

logger = logging.getLogger(__name__)
from services.program_service_errors import ProgramServiceValidationError


class _ProgramCrudMixin(_ProgramMixinBase):
    @classmethod
    def get_program_summaries(cls, session, root_id: str, current_user_id: str | None = None) -> List[Dict]:
        """Return every program's lightweight metadata; the calendar feed owns dated content."""
        cls._require_root_access(session, root_id, current_user_id)
        programs = session.query(
            Program.id,
            Program.root_id,
            Program.name,
            Program.color,
            Program.start_date,
            Program.end_date,
        ).filter_by(root_id=root_id).all()
        return [
            {
                "id": program_id,
                "root_id": program_root_id,
                "name": name,
                "color": color,
                "start_date": format_utc(start_value),
                "end_date": format_utc(end_value),
            }
            for program_id, program_root_id, name, color, start_value, end_value in programs
        ]

    @classmethod
    def get_programs(cls, session, root_id: str, current_user_id: str | None = None, *, as_of=None) -> List[Dict]:
        cls._require_root_access(session, root_id, current_user_id)

        programs = session.query(Program).options(
            *cls._program_serializer_load_options()
        ).filter_by(root_id=root_id).all()
        scopes = resolve_program_scopes(session, root_id, [program.id for program in programs])
        return [serialize_program(program, scope=scopes.get(program.id), as_of=as_of) for program in programs]

    @classmethod
    def get_program(cls, session, root_id: str, program_id: str, current_user_id: str | None = None, *, as_of=None) -> Optional[Dict]:
        cls._require_root_access(session, root_id, current_user_id)

        program = session.query(Program).options(
            *cls._program_serializer_load_options()
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None
        
        return serialize_program(program, scope=resolve_program_scope(session, root_id, program.id), as_of=as_of)

    @classmethod
    def create_block(
        cls, session, root_id: str, program_id: str, data: Dict,
        current_user_id: str | None = None, *, commit=True, pending_events=None,
    ) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")

        start_date_val = cls._parse_optional_block_date(data, 'start_date', 'startDate')
        end_date_val = cls._parse_optional_block_date(data, 'end_date', 'endDate')
        assert_block_dates_valid(program, start_date_val, end_date_val)
        assert_no_block_overlap(session, program.id, start_date_val, end_date_val)

        new_block = ProgramBlock(
            program_id=program.id,
            name=data['name'],
            start_date=start_date_val,
            end_date=end_date_val,
            color=data.get('color'),
            **cls._block_week_fields(data, None),
        )
        session.add(new_block)
        flush_block_dates(session, new_block)

        cls._commit(session, new_block, commit=commit)
        event = Event(Events.PROGRAM_BLOCK_CREATED, {
            'block_id': new_block.id,
            'block_name': new_block.name,
            'program_id': program_id,
            'root_id': root_id,
        }, source='cls.create_block')
        cls._queue_or_emit_event(pending_events, event)
        return serialize_program_block(new_block)

    @classmethod
    def update_block(
        cls, session, root_id: str, program_id: str, block_id: str, data: Dict,
        current_user_id: str | None = None, *, commit=True, pending_events=None,
    ) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program.id).first()
        if not block:
            raise ValueError("Block not found")

        if 'name' in data:
            block.name = data['name']
        if 'color' in data:
            block.color = data['color']
        for key, value in cls._block_week_fields(data, block).items():
            setattr(block, key, value)

        changes_dates = any(key in data for key in ('start_date', 'startDate', 'end_date', 'endDate'))
        if changes_dates:
            # Validate before assigning so autoflush never sends a conflicting range.
            next_start = (
                cls._parse_optional_block_date(data, 'start_date', 'startDate')
                if 'start_date' in data or 'startDate' in data else block.start_date
            )
            next_end = (
                cls._parse_optional_block_date(data, 'end_date', 'endDate')
                if 'end_date' in data or 'endDate' in data else block.end_date
            )
            assert_block_dates_valid(program, next_start, next_end)
            assert_no_block_overlap(session, program.id, next_start, next_end, exclude_block_id=block.id)
            block.start_date, block.end_date = next_start, next_end
            flush_block_dates(session, block)

        cls._commit(session, block, commit=commit)
        event = Event(Events.PROGRAM_BLOCK_UPDATED, {
            'block_id': block.id,
            'block_name': block.name,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
        }, source='cls.update_block')
        cls._queue_or_emit_event(pending_events, event)
        return serialize_program_block(block)

    @classmethod
    def delete_block(cls, session, root_id: str, program_id: str, block_id: str, current_user_id: str | None = None):
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program.id).first()
        if not block:
            raise ValueError("Block not found")

        session.delete(block)
        cls._commit(session)

    @classmethod
    def create_program(
        cls, session, root_id: str, validated_data: Dict,
        current_user_id: str | None = None, *, commit=True, pending_events=None,
    ) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        if current_user_id:
            quota_service = QuotaService(session)
            _, quota_error, quota_status = quota_service.check_available(current_user_id, "programs")
            if quota_error:
                raise ProgramServiceValidationError(quota_error, quota_status)
            _, storage_error, storage_status = quota_service.check_storage_available(
                current_user_id,
                QuotaService._payload_size(
                    validated_data.get('name'),
                    validated_data.get('description'),
                    validated_data.get('weeklySchedule'),
                    validated_data.get('selectedGoals'),
                ),
            )
            if storage_error:
                raise ProgramServiceValidationError(storage_error, storage_status)
        
        # Parse dates
        start_date = cls._parse_program_datetime(validated_data['start_date'], 'start_date')
        end_date = cls._parse_program_datetime(validated_data['end_date'], 'end_date')
        cls._check_no_program_overlap(session, root_id, start_date, end_date)
        
        new_program = Program(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name=validated_data['name'],
            description=validated_data.get('description', ''),
            color=validated_data.get('color'),
            start_date=start_date,
            end_date=end_date,
            weekly_schedule=[],
        )
        
        goal_ids = validated_data.get('selectedGoals', [])

        session.add(new_program)
        session.flush()
        cls._replace_program_goals(session, str(new_program.id), goal_ids, root_id)
        
        cls._commit(session, new_program, commit=commit)

        event = Event(Events.PROGRAM_CREATED, {
            'program_id': new_program.id,
            'program_name': new_program.name,
            'root_id': root_id
        }, source='cls.create_program')
        cls._queue_or_emit_event(pending_events, event)
        
        return serialize_program(
            new_program,
            scope=resolve_program_scope(session, root_id, new_program.id),
        )

    @classmethod
    def update_program(
        cls, session, root_id: str, program_id: str, validated_data: Dict,
        current_user_id: str | None = None, *, commit=True, pending_events=None,
    ) -> Optional[Dict]:
        cls._require_root_access(session, root_id, current_user_id)
        changes_dates = 'start_date' in validated_data or 'end_date' in validated_data
        program = (
            lock_program_calendar(session, program_id, root_id) if changes_dates
            else get_owned_program(session, root_id, program_id)
        )
        if not program:
            return None

        next_start_date = cls._parse_program_datetime(
            validated_data.get('start_date', program.start_date),
            'start_date',
        )
        next_end_date = cls._parse_program_datetime(
            validated_data.get('end_date', program.end_date),
            'end_date',
        )
        if changes_dates:
            cls._check_no_program_overlap(
                session,
                root_id,
                next_start_date,
                next_end_date,
                exclude_program_id=program_id,
            )
            assert_blocks_within_program(session, program.id, next_start_date, next_end_date)
        
        if 'name' in validated_data:
            program.name = validated_data['name']
        if 'description' in validated_data:
            program.description = validated_data['description']
        if 'color' in validated_data:
            program.color = validated_data['color']
        if 'start_date' in validated_data:
            program.start_date = next_start_date
        if 'end_date' in validated_data:
            program.end_date = next_end_date
        if changes_dates:
            # Weekday days follow the program span, so a longer program repeats them further.
            assert_single_program_day_per_date(session, program.id)
        if 'selectedGoals' in validated_data:
            goal_ids = validated_data['selectedGoals']
            before = resolve_focus_scopes(session, root_id, program.id)
            cls._replace_program_goals(session, str(program.id), goal_ids, root_id)
            guard_program_goal_change(
                session, root_id, program.id, before, prune=bool(validated_data.get('prune_day_goals')),
            )
        
        cls._commit(session, program, commit=commit)

        event = Event(Events.PROGRAM_UPDATED, {
            'program_id': program.id,
            'program_name': program.name,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='cls.update_program')
        cls._queue_or_emit_event(pending_events, event)
        
        return serialize_program(
            program,
            scope=resolve_program_scope(session, root_id, program.id),
        )

    @classmethod
    def delete_program(cls, session, root_id: str, program_id: str, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")
        
        # Count sessions
        affected_sessions_count = cls._count_program_day_sessions(program)
        
        program_name = program.name
        session.delete(program)
        cls._commit(session)
        
        event_bus.emit(Event(Events.PROGRAM_DELETED, {
            'program_id': program_id,
            'program_name': program_name,
            'root_id': root_id
        }, source='cls.delete_program'))
        
        return {"affected_sessions": affected_sessions_count}

    @classmethod
    def get_program_session_count(cls, session, root_id: str, program_id: str, current_user_id: str | None = None) -> int:
        cls._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
             raise ValueError("Program not found")
        
        return cls._count_program_day_sessions(program)

    @staticmethod
    def _count_program_day_sessions(program) -> int:
        return sum(
            1
            for day in program.days
            for linked in day.completed_sessions
            if not linked.deleted_at
        )

    @staticmethod
    def _block_week_fields(data: Dict, block) -> Dict:
        """Resolve track_weeks/week_start_day from a create (block=None) or partial update."""
        if 'track_weeks' not in data and 'week_start_day' not in data:
            return {} if block is not None else {'track_weeks': False, 'week_start_day': None}
        track = bool(data['track_weeks']) if 'track_weeks' in data else bool(getattr(block, 'track_weeks', False))
        start_day = data['week_start_day'] if 'week_start_day' in data else getattr(block, 'week_start_day', None)
        if track and start_day is None:
            raise ProgramServiceValidationError({
                'error': 'Choose the weekday that weeks start on.',
                'code': 'program_block_week_start_required',
                'field': 'week_start_day',
            }, 400)
        if start_day is not None and not (isinstance(start_day, int) and 0 <= start_day <= 6):
            raise ProgramServiceValidationError({
                'error': 'Weeks must start on a weekday from Monday (0) to Sunday (6).',
                'code': 'program_block_week_start_invalid',
                'field': 'week_start_day',
            }, 400)
        return {'track_weeks': track, 'week_start_day': start_day}
