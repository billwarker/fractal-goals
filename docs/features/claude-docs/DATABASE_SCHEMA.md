# SQLite Database Schema Design for Fractal Goals

## Overview
Moving from JSON file storage to SQLite to properly handle:
1. Many-to-many relationships (practice sessions ↔ short-term goals)
2. Better query performance
3. Data integrity with foreign keys
4. Easier data migration and backups

## Database Schema

### Table 1: `goals`
Stores all goal types in a single table (polymorphic approach)

```sql
CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- 'UltimateGoal', 'LongTermGoal', etc.
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    deadline DATE,
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parent_id TEXT,  -- For tree structure (single parent)
    
    FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE INDEX idx_goals_type ON goals(type);
CREATE INDEX idx_goals_parent_id ON goals(parent_id);
CREATE INDEX idx_goals_created_at ON goals(created_at);
```

**Why single table?**
- All goals share the same core attributes
- Easier to query the entire tree
- Simpler foreign key relationships
- Type field distinguishes goal types

### Table 2: `practice_session_parents`
Junction table for many-to-many relationship between practice sessions and short-term goals

```sql
CREATE TABLE practice_session_parents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_session_id TEXT NOT NULL,
    short_term_goal_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (practice_session_id) REFERENCES goals(id) ON DELETE CASCADE,
    FOREIGN KEY (short_term_goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    
    UNIQUE(practice_session_id, short_term_goal_id)  -- Prevent duplicates
);

CREATE INDEX idx_psp_session ON practice_session_parents(practice_session_id);
CREATE INDEX idx_psp_goal ON practice_session_parents(short_term_goal_id);
```

**Why separate junction table?**
- Properly models many-to-many relationship
- Easy to query all parents of a session
- Easy to query all sessions for a goal
- Can add metadata (like when the relationship was created)

### Alternative Schema (If you want separate tables)

```sql
-- Option B: Separate tables for each goal type
CREATE TABLE ultimate_goals (...);
CREATE TABLE long_term_goals (...);
CREATE TABLE practice_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE practice_session_parents (
    practice_session_id TEXT NOT NULL,
    short_term_goal_id TEXT NOT NULL,
    FOREIGN KEY (practice_session_id) REFERENCES practice_sessions(id),
    FOREIGN KEY (short_term_goal_id) REFERENCES short_term_goals(id),
    PRIMARY KEY (practice_session_id, short_term_goal_id)
);
```

**Pros of separate tables:**
- Type safety at database level
- Can have type-specific fields
- Clearer schema

**Cons of separate tables:**
- More complex queries (lots of JOINs)
- Harder to maintain tree structure
- More tables to manage

## Recommended Approach: **Single `goals` table + Junction table**

### Why This is Best:

1. **Simplicity**: One table for all goals, easy to query entire tree
2. **Flexibility**: Easy to add new goal types without schema changes
3. **Tree Structure**: Parent-child relationships are straightforward
4. **Many-to-Many**: Junction table handles practice session relationships
5. **Performance**: Fewer JOINs needed for most queries

## Example Queries

### Get all practice sessions with their parent goals
```sql
SELECT 
    g.id,
    g.name,
    g.description,
    GROUP_CONCAT(pg.name) as parent_goals
FROM goals g
LEFT JOIN practice_session_parents psp ON g.id = psp.practice_session_id
LEFT JOIN goals pg ON psp.short_term_goal_id = pg.id
WHERE g.type = 'PracticeSession'
GROUP BY g.id;
```

### Get all short-term goals linked to a specific practice session
```sql
SELECT g.*
FROM goals g
JOIN practice_session_parents psp ON g.id = psp.short_term_goal_id
WHERE psp.practice_session_id = ?;
```

### Get entire goal tree (recursive)
```sql
WITH RECURSIVE goal_tree AS (
    -- Base case: root goals (no parent)
    SELECT id, name, type, parent_id, 0 as level
    FROM goals
    WHERE parent_id IS NULL
    
    UNION ALL
    
    -- Recursive case: children
    SELECT g.id, g.name, g.type, g.parent_id, gt.level + 1
    FROM goals g
    JOIN goal_tree gt ON g.parent_id = gt.id
)
SELECT * FROM goal_tree ORDER BY level, name;
```

## Migration Strategy

### Phase 1: Create Database Schema
1. Create SQLite database file
2. Run schema creation SQL
3. Keep JSON file as backup

### Phase 2: Data Migration
1. Read existing goals_db.json
2. Insert all goals into `goals` table
3. For practice sessions, insert relationships into junction table
4. Verify data integrity

### Phase 3: Update Backend Code
1. Replace JSON file I/O with SQLite queries
2. Update `load_goals()` to read from database
3. Update `save_goals()` to write to database
4. Update API endpoints to use database queries

### Phase 4: Testing
1. Test all CRUD operations
2. Test practice session creation with multiple parents
3. Test tree reconstruction
4. Verify data persistence

## Implementation Libraries

**Recommended: SQLAlchemy ORM**
```python
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

Base = declarative_base()

# Junction table
practice_session_parents = Table('practice_session_parents', Base.metadata,
    Column('practice_session_id', String, ForeignKey('goals.id')),
    Column('short_term_goal_id', String, ForeignKey('goals.id'))
)

class Goal(Base):
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    parent_id = Column(String, ForeignKey('goals.id'))
    
    # Relationships
    children = relationship("Goal", backref=backref('parent', remote_side=[id]))
    
    # For practice sessions only
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_parents,
        primaryjoin=id==practice_session_parents.c.practice_session_id,
        secondaryjoin=id==practice_session_parents.c.short_term_goal_id,
        backref="practice_sessions"
    )
```

**Alternative: Raw SQLite (simpler, more control)**
```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_db():
    conn = sqlite3.connect('goals.db')
    conn.row_factory = sqlite3.Row  # Return rows as dicts
    try:
        yield conn
    finally:
        conn.close()

def create_goal(name, type, description='', parent_id=None):
    with get_db() as conn:
        cursor = conn.cursor()
        goal_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO goals (id, type, name, description, parent_id)
            VALUES (?, ?, ?, ?, ?)
        """, (goal_id, type, name, description, parent_id))
        conn.commit()
        return goal_id
```

## My Recommendation

**Use SQLAlchemy ORM** because:
1. ✅ Handles relationships automatically
2. ✅ Type safety and validation
3. ✅ Easy migrations with Alembic
4. ✅ Less boilerplate code
5. ✅ Better for complex queries
6. ✅ Easier to test

**Schema: Single `goals` table + Junction table** because:
1. ✅ Simpler to maintain
2. ✅ Flexible for future goal types
3. ✅ Easy tree traversal
4. ✅ Proper many-to-many support
5. ✅ Good performance with indexes

## Next Steps

1. **Approve schema design** ✓
2. **Choose implementation approach** (SQLAlchemy vs raw SQLite)
3. **Create database schema**
4. **Migrate existing data**
5. **Update backend code**
6. **Test thoroughly**
7. **Continue with frontend**

Would you like me to proceed with SQLAlchemy ORM implementation?
