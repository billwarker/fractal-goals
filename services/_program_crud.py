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

logger = logging.getLogger(__name__)
from services.program_service_errors import ProgramServiceValidationError


class _ProgramCrudMixin:
    @classmethod
    def get_programs(cls, session, root_id: str, current_user_id: str | None = None) -> List[Dict]:
        cls._require_root_access(session, root_id, current_user_id)

        programs = session.query(Program).options(
            *cls._program_serializer_load_options()
        ).filter_by(root_id=root_id).all()
        return [serialize_program(program) for program in programs]

    @classmethod
    def get_program(cls, session, root_id: str, program_id: str, current_user_id: str | None = None) -> Optional[Dict]:
        cls._require_root_access(session, root_id, current_user_id)

        program = session.query(Program).options(
            *cls._program_serializer_load_options()
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None
        
        return serialize_program(program)

    @classmethod
    def create_block(cls, session, root_id: str, program_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        start_date_val = cls._parse_optional_block_date(data, 'start_date', 'startDate')
        end_date_val = cls._parse_optional_block_date(data, 'end_date', 'endDate')

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
            cls._replace_block_goals(session, new_block.id, data['goal_ids'], root_id)

        cls._commit(session, new_block)
        event_bus.emit(Event(Events.PROGRAM_BLOCK_CREATED, {
            'block_id': new_block.id,
            'block_name': new_block.name,
            'program_id': program_id,
            'root_id': root_id,
        }, source='cls.create_block'))
        return serialize_program_block(new_block)

    @classmethod
    def update_block(cls, session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
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
            block.start_date = cls._parse_optional_block_date(data, 'start_date', 'startDate')
        if 'end_date' in data or 'endDate' in data:
            block.end_date = cls._parse_optional_block_date(data, 'end_date', 'endDate')

        if 'goal_ids' in data:
            cls._replace_block_goals(session, block.id, data['goal_ids'], root_id)
            session.expire(block, ['goals'])

        cls._commit(session, block)
        event_bus.emit(Event(Events.PROGRAM_BLOCK_UPDATED, {
            'block_id': block.id,
            'block_name': block.name,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
        }, source='cls.update_block'))
        return serialize_program_block(block)

    @classmethod
    def delete_block(cls, session, root_id: str, program_id: str, block_id: str, current_user_id: str | None = None):
        cls._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program.id).first()
        if not block:
            raise ValueError("Block not found")

        session.delete(block)
        cls._commit(session)

    @classmethod
    def create_program(cls, session, root_id: str, validated_data: Dict, current_user_id: str | None = None) -> Dict:
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
        cls._replace_program_goals(session, new_program.id, goal_ids, root_id)
        
        cls._commit(session, new_program)

        event_bus.emit(Event(Events.PROGRAM_CREATED, {
            'program_id': new_program.id,
            'program_name': new_program.name,
            'root_id': root_id
        }, source='cls.create_program'))
        
        return serialize_program(new_program)

    @classmethod
    def update_program(cls, session, root_id: str, program_id: str, validated_data: Dict, current_user_id: str | None = None) -> Optional[Dict]:
        cls._require_root_access(session, root_id, current_user_id)
        program = get_owned_program(session, root_id, program_id)
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
        if 'start_date' in validated_data or 'end_date' in validated_data:
            cls._check_no_program_overlap(
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
        if 'color' in validated_data:
            program.color = validated_data['color']
        if 'start_date' in validated_data:
            program.start_date = next_start_date
        if 'end_date' in validated_data:
            program.end_date = next_end_date
        if 'selectedGoals' in validated_data:
            goal_ids = validated_data['selectedGoals']
            cls._replace_program_goals(session, program.id, goal_ids, root_id)
        
        cls._commit(session, program)
        
        event_bus.emit(Event(Events.PROGRAM_UPDATED, {
            'program_id': program.id,
            'program_name': program.name,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='cls.update_program'))
        
        return serialize_program(program)

    @classmethod
    def delete_program(cls, session, root_id: str, program_id: str, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
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
        
        count = 0
        for block in program.blocks:
            for day in block.days:
                count += len([s for s in day.completed_sessions if not s.deleted_at])
        return count
