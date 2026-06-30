"""Program-day / block / program completion checks.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import logging


from services.serializers import format_utc
from models import Program, ProgramBlock, ProgramDay, ProgramDaySession, Session, _safe_load_json
from services import Event, Events

logger = logging.getLogger(__name__)


class _ProgramCompletionMixin:
    @classmethod
    def check_program_day_completion(cls, session, session_id: str, pending_events=None) -> bool:
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
            
            cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_DAY_COMPLETED, {
                'day_id': p_day.id,
                'day_name': p_day.name,
                'block_id': p_day.block_id,
                'root_id': p_day.block.program.root_id if p_day.block and p_day.block.program else completed_session.root_id,
                'date': format_utc(p_day.date)
            }, source='cls.check_program_day_completion'))
            
            # Check Block Completion
            cls._check_block_completion(session, p_day.block_id, pending_events=pending_events)
            
            return True
        
        return False

    @classmethod
    def _check_block_completion(cls, session, block_id: str, pending_events=None):
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
                cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_BLOCK_COMPLETED, {
                    'block_id': block.id,
                    'block_name': block.name,
                    'program_id': block.program_id,
                    'root_id': block.program.root_id if block.program else None,
                }, source='cls._check_block_completion'))

            # Check Program Completion
            cls._check_program_completion(session, block.program_id, pending_events=pending_events)
        else:
            if block.is_completed:
                block.is_completed = False

    @classmethod
    def _check_program_completion(cls, session, program_id: str, pending_events=None):
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
                 cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_COMPLETED, {
                    'program_id': program.id,
                    'program_name': program.name,
                    'root_id': program.root_id
                }, source='cls._check_program_completion'))
        else:
            if program.is_completed:
                program.is_completed = False
