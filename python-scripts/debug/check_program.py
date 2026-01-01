from sqlalchemy import create_engine, text
import sys
import os

# Add parent to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Program, get_engine, get_session
from config import config

config.ENV = 'development'

def check_program(pid):
    # Manually override DB if needed to match dev
    db_path = 'goals.db'
    engine = create_engine(f'sqlite:///{db_path}')
    session = get_session(engine)
    
    print(f"Checking DB: {db_path} for Program ID: {pid}")
    
    program = session.query(Program).filter_by(id=pid).first()
    
    if program:
        print(f"FOUND: {program.name}")
        print(f"Weekly Schedule Len: {len(program.weekly_schedule) if program.weekly_schedule else 0}")
    else:
        print("NOT FOUND.")
        # List all programs
        all_progs = session.query(Program).all()
        print(f"Total Programs in DB: {len(all_progs)}")
        for p in all_progs:
            print(f" - {p.id}: {p.name}")

if __name__ == "__main__":
    check_program("9705d2c4-89a1-41bd-84ce-2b2e35c92765")
