from sqlalchemy import create_engine
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Program, get_session
from config import config

def get_details():
    db_path = 'goals.db' # Prod
    engine = create_engine(f'sqlite:///{db_path}')
    session = get_session(engine)
    p = session.query(Program).filter_by(id='9705d2c4-89a1-41bd-84ce-2b2e35c92765').first()
    if p:
        print(f"Root: {p.root_id}")
    else:
        print("Not Found")

if __name__ == "__main__":
    get_details()
