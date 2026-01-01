import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Program, ProgramBlock, ProgramDay, ScheduledSession

def get_db_url(env_name):
    # Assuming standard locations relative to CWD
    if env_name == 'production': return 'sqlite:///goals.db'
    if env_name == 'development': return 'sqlite:///goals_dev.db'
    return 'sqlite:///goals.db'

def copy_program():
    print("Starting Copy from Production (goals.db) to Development (goals_dev.db)...")
    
    # 1. Read Prod
    prod_engine = create_engine(get_db_url('production'))
    ProdSession = sessionmaker(bind=prod_engine)
    prod_session = ProdSession()
    
    prog_id = '9705d2c4-89a1-41bd-84ce-2b2e35c92765'
    
    try:
        source_prog = prod_session.query(Program).get(prog_id)
        if not source_prog:
            print("Program not found in Production!")
            return

        print(f"Reading Program: {source_prog.name}")
        
        # Serialize Data deeply
        p_data = {
            'id': source_prog.id,
            'root_id': source_prog.root_id,
            'name': source_prog.name,
            'description': source_prog.description,
            'start_date': source_prog.start_date,
            'end_date': source_prog.end_date,
            'is_active': source_prog.is_active,
            'goal_ids': source_prog.goal_ids,
            'weekly_schedule': source_prog.weekly_schedule,
            'blocks': []
        }
        
        for b in source_prog.blocks:
            b_data = {
                'id': b.id,
                'name': b.name,
                'start_date': b.start_date,
                'end_date': b.end_date,
                'color': b.color,
                'goal_ids': b.goal_ids,
                'days': []
            }
            for d in b.days:
                d_data = {
                   'id': d.id,
                   'date': d.date,
                   'day_number': d.day_number,
                   'name': d.name,
                   'notes': d.notes,
                   'sessions': [] 
                }
                for s in d.sessions:
                    s_data = {
                        'id': s.id,
                        'session_template_id': s.session_template_id,
                        'is_completed': s.is_completed,
                        'completion_data': s.completion_data
                    }
                    d_data['sessions'].append(s_data)
                b_data['days'].append(d_data)
            p_data['blocks'].append(b_data)
            
    finally:
        prod_session.close()
        
    # 2. Write Dev
    dev_engine = create_engine(get_db_url('development'))
    DevSession = sessionmaker(bind=dev_engine)
    dev_session = DevSession()
    
    try:
        # Check existing
        existing = dev_session.query(Program).get(prog_id)
        if existing:
            print("Deleting existing program in Dev...")
            dev_session.delete(existing)
            dev_session.flush()
            
        print("Creating Program in Dev...")
        new_prog = Program(
            id=p_data['id'],
            root_id=p_data['root_id'],
            name=p_data['name'],
            description=p_data['description'],
            start_date=p_data['start_date'],
            end_date=p_data['end_date'],
            is_active=p_data['is_active'],
            goal_ids=p_data['goal_ids'],
            weekly_schedule=p_data['weekly_schedule']
        )
        dev_session.add(new_prog)
        
        for b in p_data['blocks']:
            new_block = ProgramBlock(
                id=b['id'],
                program_id=p_data['id'],
                name=b['name'],
                start_date=b['start_date'],
                end_date=b['end_date'],
                color=b['color'],
                goal_ids=b['goal_ids']
            )
            dev_session.add(new_block)
            
            for d in b['days']:
                new_day = ProgramDay(
                    id=d['id'],
                    block_id=b['id'],
                    date=d['date'],
                    day_number=d['day_number'],
                    name=d['name'],
                    notes=d['notes']
                )
                dev_session.add(new_day)
                
                for s in d['sessions']:
                    new_sess = ScheduledSession(
                        id=s['id'],
                        day_id=d['id'],
                        session_template_id=s['session_template_id'],
                        is_completed=s['is_completed'],
                        completion_data=s['completion_data']
                    )
                    dev_session.add(new_sess)
                    
        dev_session.commit()
        print("Successfully copied Program to Dev DB!")
        
    except Exception as e:
        dev_session.rollback()
        print(f"Error writing to Dev: {e}")
        import traceback
        traceback.print_exc()
    finally:
        dev_session.close()

if __name__ == "__main__":
    copy_program()
