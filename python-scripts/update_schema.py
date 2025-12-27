from sqlalchemy import create_engine, text

# Use direct path to ensure we hit the right DB
engine = create_engine('sqlite:///goals.db')

def add_column():
    with engine.connect() as conn:
        try:
            # Check if column exists first? SQLite doesn't support IF NOT EXISTS in ADD COLUMN easily
            # Just try adding it.
            conn.execute(text("ALTER TABLE practice_sessions ADD COLUMN root_id VARCHAR"))
            conn.commit() # IMPORTANT: Commit the change
            print("Successfully added root_id column to practice_sessions table.")
        except Exception as e:
            if "duplicate column name" in str(e):
                print("Column root_id already exists.")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    add_column()
