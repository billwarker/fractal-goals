import sqlite3
import os

DB_PATH = 'goals_dev.db'

def migrate():
    print(f"Migrating {DB_PATH} notes table...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Rename entity_type -> context_type
    try:
        cursor.execute("ALTER TABLE notes RENAME COLUMN entity_type TO context_type")
        print("Renamed entity_type -> context_type")
    except sqlite3.OperationalError as e:
        print(f"Skip rename context_type: {e}")

    # 2. Rename entity_id -> context_id
    try:
        cursor.execute("ALTER TABLE notes RENAME COLUMN entity_id TO context_id")
        print("Renamed entity_id -> context_id")
    except sqlite3.OperationalError as e:
        print(f"Skip rename context_id: {e}")

    # 3. Add activity_instance_id
    try:
        cursor.execute("ALTER TABLE notes ADD COLUMN activity_instance_id VARCHAR(36)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_activity_instance ON notes (activity_instance_id)")
        print("Added activity_instance_id")
    except sqlite3.OperationalError as e:
        print(f"Skip add activity_instance_id: {e}")

    # 4. Add activity_definition_id
    try:
        cursor.execute("ALTER TABLE notes ADD COLUMN activity_definition_id VARCHAR(36)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_activity_definition ON notes (activity_definition_id)")
        print("Added activity_definition_id")
    except sqlite3.OperationalError as e:
        print(f"Skip add activity_definition_id: {e}")

    # 5. Add set_index
    try:
        cursor.execute("ALTER TABLE notes ADD COLUMN set_index INTEGER")
        print("Added set_index")
    except sqlite3.OperationalError as e:
        print(f"Skip add set_index: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    migrate()
