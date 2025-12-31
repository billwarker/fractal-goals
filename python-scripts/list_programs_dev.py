import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import get_engine, get_session, Program, Goal

def list_programs():
    from config import config
    print(f"Checking Database: {config.get_db_path()}")

    engine = get_engine() 
    session = get_session(engine)
    try:
        programs = session.query(Program).all()
        print(f"Found {len(programs)} programs.")
        for p in programs:
            print(f"ID: {p.id}, Name: {p.name}")
            
        print("-" * 20)
        # Check specific root goal
        root_id = '2c848745-856e-4e3a-8b05-ebdd206de496'
        root = session.query(Goal).filter_by(id=root_id).first()
        if root:
            print(f"Root Goal {root_id} FOUND in this DB.")
        else:
            print(f"Root Goal {root_id} MISSING in this DB.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    list_programs()
