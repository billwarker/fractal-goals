# Revised SQLite Database Schema Design for Fractal Goals

## Overview
Hybrid approach: Goals in one table, Practice Sessions in a separate table for extensibility.

## Database Schema

### Table 1: `goals`
Stores all goal types EXCEPT practice sessions

```sql
CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- 'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 
                         -- 'ImmediateGoal', 'MicroGoal', 'NanoGoal'
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    deadline DATE,
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parent_id TEXT,  -- For tree structure (references goals.id OR practice_sessions.id)
    
    -- Note: parent_id can reference either goals table or practice_sessions table
    -- SQLite doesn't enforce cross-table foreign keys strictly, but we'll handle in code
    CHECK (type IN ('UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 
                    'ImmediateGoal', 'MicroGoal', 'NanoGoal'))
);

CREATE INDEX idx_goals_type ON goals(type);
CREATE INDEX idx_goals_parent_id ON goals(parent_id);
CREATE INDEX idx_goals_created_at ON goals(created_at);
```

### Table 2: `practice_sessions`
Separate table for practice sessions with room for future attributes

```sql
CREATE TABLE practice_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Future extensibility: Add practice session-specific fields here
    -- duration INTEGER,              -- Session duration in minutes
    -- focus_score INTEGER,           -- User's focus rating (1-10)
    -- energy_level INTEGER,          -- Energy level during session (1-10)
    -- session_notes TEXT,            -- Detailed notes about the session
    -- tags TEXT,                     -- Comma-separated tags
    -- location TEXT,                 -- Where the session took place
    -- tools_used TEXT,               -- Tools/resources used
    -- interruptions INTEGER,         -- Number of interruptions
    -- actual_start_time TIMESTAMP,   -- When session actually started
    -- actual_end_time TIMESTAMP,     -- When session actually ended
    -- planned_duration INTEGER,      -- How long it was supposed to take
    -- productivity_rating INTEGER    -- Self-assessed productivity (1-10)
);

CREATE INDEX idx_practice_sessions_created_at ON practice_sessions(created_at);
CREATE INDEX idx_practice_sessions_completed ON practice_sessions(completed);
```

### Table 3: `practice_session_goals`
Junction table for many-to-many relationship between practice sessions and short-term goals

```sql
CREATE TABLE practice_session_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_session_id TEXT NOT NULL,
    short_term_goal_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (practice_session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (short_term_goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    
    UNIQUE(practice_session_id, short_term_goal_id)  -- Prevent duplicates
);

CREATE INDEX idx_psg_session ON practice_session_goals(practice_session_id);
CREATE INDEX idx_psg_goal ON practice_session_goals(short_term_goal_id);
```

## Relationships

```
goals (tree structure via parent_id)
  ├─ UltimateGoal
  │   └─ LongTermGoal
  │       └─ MidTermGoal
  │           └─ ShortTermGoal ──┐
  │                              │
  │                              │ (many-to-many)
  │                              ↓
  │                      practice_session_goals (junction)
  │                              ↓
  │                      practice_sessions
  │                              │
  │                              │ (one-to-many via parent_id)
  │                              ↓
  └─ ImmediateGoal (parent_id → practice_sessions.id)
      └─ MicroGoal
          └─ NanoGoal
```

## Key Design Decisions

### Why Separate `practice_sessions` Table?

1. **Future Extensibility** ✅
   - Can add session-specific metrics (duration, focus score, etc.)
   - Can add session metadata (location, tools used, etc.)
   - Can add analytics fields without affecting goals table
   
2. **Cleaner Separation of Concerns**
   - Goals represent objectives
   - Practice sessions represent work sessions
   - Different conceptual entities
   
3. **Different Relationship Patterns**
   - Goals have single parent (tree)
   - Practice sessions have multiple parents (many-to-many)
   
4. **Query Optimization**
   - Can index practice session-specific fields
   - Separate queries for sessions vs goals
   - Better performance for session analytics

### Handling Cross-Table Relationships

**ImmediateGoals → Practice Sessions:**
```sql
-- ImmediateGoal has parent_id pointing to practice_sessions.id
INSERT INTO goals (id, type, name, parent_id)
VALUES ('ig001', 'ImmediateGoal', 'Complete feature', 'ps001');
-- parent_id 'ps001' references practice_sessions.id
```

**Short-Term Goals ↔ Practice Sessions:**
```sql
-- Many-to-many via junction table
INSERT INTO practice_session_goals (practice_session_id, short_term_goal_id)
VALUES ('ps001', 'stg001');
```

## Example Queries

### Create a practice session with multiple parents
```sql
-- 1. Create practice session
INSERT INTO practice_sessions (id, name, description)
VALUES ('ps001', 'Practice Session 1 - 12/21/2025', 'Focus on React and design');

-- 2. Link to short-term goals
INSERT INTO practice_session_goals (practice_session_id, short_term_goal_id)
VALUES 
    ('ps001', 'stg001'),  -- Learn React
    ('ps001', 'stg002'),  -- Study Design
    ('ps001', 'stg003');  -- Build Portfolio

-- 3. Create immediate goals under the session
INSERT INTO goals (id, type, name, description, parent_id)
VALUES 
    ('ig001', 'ImmediateGoal', 'Complete feature X', 'Implement login', 'ps001'),
    ('ig002', 'ImmediateGoal', 'Review code', 'Code review session', 'ps001');
```

### Get practice session with all parent goals
```sql
SELECT 
    ps.id,
    ps.name,
    ps.description,
    ps.created_at,
    json_group_array(
        json_object(
            'id', g.id,
            'name', g.name,
            'type', g.type
        )
    ) as parent_goals
FROM practice_sessions ps
LEFT JOIN practice_session_goals psg ON ps.id = psg.practice_session_id
LEFT JOIN goals g ON psg.short_term_goal_id = g.id
WHERE ps.id = 'ps001'
GROUP BY ps.id;
```

### Get all immediate goals for a practice session
```sql
SELECT *
FROM goals
WHERE type = 'ImmediateGoal' 
  AND parent_id = 'ps001';
```

### Get all practice sessions for a short-term goal
```sql
SELECT ps.*
FROM practice_sessions ps
JOIN practice_session_goals psg ON ps.id = psg.practice_session_id
WHERE psg.short_term_goal_id = 'stg001'
ORDER BY ps.created_at DESC;
```

### Get complete practice session tree
```sql
-- Get session with parents and children
SELECT 
    ps.id as session_id,
    ps.name as session_name,
    -- Parent goals (many-to-many)
    (SELECT json_group_array(json_object('id', g.id, 'name', g.name))
     FROM practice_session_goals psg
     JOIN goals g ON psg.short_term_goal_id = g.id
     WHERE psg.practice_session_id = ps.id) as parent_goals,
    -- Child goals (one-to-many)
    (SELECT json_group_array(json_object('id', g.id, 'name', g.name, 'type', g.type))
     FROM goals g
     WHERE g.parent_id = ps.id) as immediate_goals
FROM practice_sessions ps
WHERE ps.id = 'ps001';
```

## SQLAlchemy Models

```python
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Integer, ForeignKey, Table, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime

Base = declarative_base()

# Junction table for many-to-many
practice_session_goals = Table(
    'practice_session_goals',
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('practice_session_id', String, ForeignKey('practice_sessions.id', ondelete='CASCADE')),
    Column('short_term_goal_id', String, ForeignKey('goals.id', ondelete='CASCADE')),
    Column('created_at', DateTime, default=datetime.now)
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
    parent_id = Column(String)  # Can reference goals.id or practice_sessions.id
    
    # Self-referential relationship for goal tree
    children = relationship(
        "Goal",
        foreign_keys=[parent_id],
        remote_side=[id],
        backref='parent'
    )

class PracticeSession(Base):
    __tablename__ = 'practice_sessions'
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Future extensibility fields (commented out for now)
    # duration = Column(Integer)
    # focus_score = Column(Integer)
    # energy_level = Column(Integer)
    # session_notes = Column(Text)
    # tags = Column(String)
    # location = Column(String)
    
    # Many-to-many relationship with short-term goals
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_goals,
        backref="practice_sessions"
    )
    
    # One-to-many relationship with immediate goals
    # Note: This is handled via Goal.parent_id pointing to practice_sessions.id
    # We'll need a custom query or property for this

# Helper to get immediate goals for a practice session
def get_immediate_goals(session, practice_session_id):
    return session.query(Goal).filter(
        Goal.type == 'ImmediateGoal',
        Goal.parent_id == practice_session_id
    ).all()
```

## Migration Strategy

### Phase 1: Create Database
```python
from sqlalchemy import create_engine
from models import Base

engine = create_engine('sqlite:///goals.db')
Base.metadata.create_all(engine)
```

### Phase 2: Migrate Data from JSON
```python
import json
from sqlalchemy.orm import sessionmaker
from models import Goal, PracticeSession, practice_session_goals

Session = sessionmaker(bind=engine)
db_session = Session()

# Load JSON
with open('goals_db.json', 'r') as f:
    data = json.load(f)

# Recursive function to migrate goals
def migrate_goal(goal_data, parent_id=None):
    goal_type = goal_data['attributes']['type']
    
    if goal_type == 'PracticeSession':
        # Create practice session
        ps = PracticeSession(
            id=goal_data['id'],
            name=goal_data['name'],
            description=goal_data['attributes'].get('description', ''),
            completed=goal_data['attributes'].get('completed', False),
            created_at=goal_data['attributes'].get('created_at')
        )
        db_session.add(ps)
        
        # Handle parent relationships if they exist
        parent_ids = goal_data['attributes'].get('parent_ids', [])
        for parent_id in parent_ids:
            # Will need to insert into junction table after all goals are created
            pass
        
        # Recursively add children
        for child_data in goal_data.get('children', []):
            migrate_goal(child_data, parent_id=ps.id)
    else:
        # Create regular goal
        goal = Goal(
            id=goal_data['id'],
            type=goal_type,
            name=goal_data['name'],
            description=goal_data['attributes'].get('description', ''),
            deadline=goal_data['attributes'].get('deadline'),
            completed=goal_data['attributes'].get('completed', False),
            created_at=goal_data['attributes'].get('created_at'),
            parent_id=parent_id
        )
        db_session.add(goal)
        
        # Recursively add children
        for child_data in goal_data.get('children', []):
            migrate_goal(child_data, parent_id=goal.id)

# Migrate all root goals
for root_data in data:
    migrate_goal(root_data)

db_session.commit()
```

## Benefits of This Design

✅ **Extensibility**: Easy to add practice session-specific fields
✅ **Separation**: Clear distinction between goals and sessions
✅ **Flexibility**: Can query sessions independently
✅ **Analytics**: Can add session metrics without affecting goals
✅ **Performance**: Separate indexes for different query patterns
✅ **Future-proof**: Room to grow practice session features

## Potential Future Features

With separate `practice_sessions` table, you could add:
- Session duration tracking
- Focus/productivity metrics
- Session templates
- Recurring sessions
- Session analytics dashboard
- Time-of-day patterns
- Session streaks/habits
- Pomodoro integration
- Session sharing/collaboration
- Session reviews/retrospectives

This design supports all of these without touching the goals table!
