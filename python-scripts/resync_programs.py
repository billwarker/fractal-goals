import sys
import os
import json
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, get_session, Program, ProgramBlock, ProgramDay, ScheduledSession
from config import config

def sync_program_structure(session, program, schedule_list):
    """
    Syncs the JSON schedule list (from frontend) into ProgramBlock/Day/Session tables.
    """
    if not isinstance(schedule_list, list):
        return

    # 1. Map existing blocks
    existing_blocks = {b.id: b for b in program.blocks}
    processed_block_ids = set()

    for block_data in schedule_list:
        b_id = block_data.get('id') or str(uuid.uuid4())
        
        # Parse metadata
        try:
            start_dt = datetime.fromisoformat(block_data['startDate'].replace('Z', '')).date()
            end_dt = datetime.fromisoformat(block_data['endDate'].replace('Z', '')).date()
        except:
            continue # Skip bad data

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
        
        # SYNC DAYS
        templates_map = block_data.get('weeklySchedule', {})
        existing_days = {(d.date): d for d in block.days}
        
        curr = start_dt
        day_index = 1
        while curr <= end_dt:
            day_name = curr.strftime('%A').lower()
            day_templates = templates_map.get(day_name, [])
            
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
            
            # SYNC SESSIONS
            existing_sessions = {s.session_template_id: s for s in day.sessions}
            active_template_ids = []
            
            for tid in day_templates:
                if tid in existing_sessions:
                    active_template_ids.append(tid)
                else:
                    new_session = ScheduledSession(
                        id=str(uuid.uuid4()),
                        day_id=day.id,
                        session_template_id=tid,
                        is_completed=False
                    )
                    new_session.day = day
                    session.add(new_session)
                    active_template_ids.append(tid)
            
            # Remove old sessions
            for s in day.sessions:
                if s.session_template_id not in active_template_ids:
                     session.delete(s)
            
            curr += timedelta(days=1)
            day_index += 1

    # Cleanup deleted blocks
    for bid, blk in existing_blocks.items():
        if bid not in processed_block_ids:
            session.delete(blk)

def main():
    print(f"Resyncing programs for env: {config.ENV}")
    engine = get_engine()
    session = get_session(engine)
    
    try:
        programs = session.query(Program).all()
        print(f"Found {len(programs)} programs.")
        
        for p in programs:
            print(f"Syncing Program: {p.name} ({p.id})")
            schedule_list = json.loads(p.weekly_schedule) if p.weekly_schedule else []
            sync_program_structure(session, p, schedule_list)
        
        session.commit()
        print("Sync Complete.")
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        session.close()

if __name__ == "__main__":
    main()
