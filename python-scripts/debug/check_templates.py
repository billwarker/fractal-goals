import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import get_engine, get_session, SessionTemplate, ScheduledSession

def check_templates():
    from config import config
    print(f"Checking Database: {config.get_db_path()}")

    engine = get_engine()
    session = get_session(engine)
    try:
        count = session.query(ScheduledSession).count()
        print(f"Found {count} Scheduled Sessions.")
        sessions = session.query(ScheduledSession).limit(20).all()
        for s in sessions:
            print(f"Session {s.id}: DayID={s.day_id}, TemplateID={s.session_template_id}, HasRel?={s.template is not None}")
            if s.template:
                print(f"  -> Template Name: {s.template.name}")
            else:
                print("  -> NO RELATIONSHIP")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    check_templates()
