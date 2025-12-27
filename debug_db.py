
import sqlite3

def debug_goals():
    conn = sqlite3.connect('goals.db')
    cursor = conn.cursor()
    
    print("\n--- ALL GOALS (LIMIT 20) ---")
    cursor.execute("SELECT id, type, name, parent_id, root_id FROM goals LIMIT 20")
    for row in cursor.fetchall():
        print(row)
        
    print("\n--- ROOT GOALS (parent_id IS NULL AND type != 'PracticeSession') ---")
    cursor.execute("SELECT id, type, name FROM goals WHERE parent_id IS NULL AND type != 'PracticeSession'")
    roots = cursor.fetchall()
    for row in roots:
        print(row)
        
    print(f"\nTotal Roots Found: {len(roots)}")
    
    conn.close()

if __name__ == "__main__":
    debug_goals()
