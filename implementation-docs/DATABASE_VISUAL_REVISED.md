# Revised Database Schema - Visual Reference

## Three-Table Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         goals                                │
├─────────────────────────────────────────────────────────────┤
│ id (PK)              TEXT                                    │
│ type                 TEXT    (UltimateGoal, LongTermGoal...) │
│ name                 TEXT                                    │
│ description          TEXT                                    │
│ deadline             DATE                                    │
│ completed            BOOLEAN                                 │
│ created_at           TIMESTAMP                               │
│ parent_id            TEXT    → goals.id OR practice_sess...  │
│                                                              │
│ CHECK: type NOT 'PracticeSession'                           │
└─────────────────────────────────────────────────────────────┘
                    ↑                           ↓
                    │                           │
        (tree structure)              (ImmediateGoals point here)
                    │                           │
┌─────────────────────────────────────────────────────────────┐
│                  practice_sessions                           │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                    TEXT                              │
│ name                       TEXT                              │
│ description                TEXT                              │
│ completed                  BOOLEAN                           │
│ created_at                 TIMESTAMP                         │
│                                                              │
│ -- Future fields --                                         │
│ duration                   INTEGER  (commented)              │
│ focus_score                INTEGER  (commented)              │
│ session_notes              TEXT     (commented)              │
│ ... (many more possibilities)                               │
└─────────────────────────────────────────────────────────────┘
                    ↑
                    │
                    │ (many-to-many)
                    │
┌─────────────────────────────────────────────────────────────┐
│              practice_session_goals                          │
│                  (Junction Table)                            │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                    INTEGER AUTO                      │
│ practice_session_id (FK)   TEXT → practice_sessions.id       │
│ short_term_goal_id (FK)    TEXT → goals.id                   │
│ created_at                 TIMESTAMP                         │
│                                                              │
│ UNIQUE(practice_session_id, short_term_goal_id)             │
└─────────────────────────────────────────────────────────────┘
```

## Complete Relationship Diagram

```
                    goals table (tree structure)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  UltimateGoal          UltimateGoal          UltimateGoal
        │                     │                     │
   LongTermGoal          LongTermGoal          LongTermGoal
        │                     │                     │
   MidTermGoal           MidTermGoal           MidTermGoal
        │                     │                     │
   ShortTermGoal ────┐   ShortTermGoal ────┐   ShortTermGoal ────┐
                     │                     │                     │
                     │                     │                     │
                     └─────────────────────┴─────────────────────┘
                                           │
                                           │ (many-to-many via junction)
                                           ↓
                            practice_session_goals (junction table)
                                           │
                                           │ (links to)
                                           ↓
                                  practice_sessions table
                                           │
                                           │ (one-to-many)
                                           │ (ImmediateGoals have parent_id → practice_sessions.id)
                                           ↓
                     ┌─────────────────────┼─────────────────────┐
                     │                     │                     │
              ImmediateGoal         ImmediateGoal         ImmediateGoal
                     │                     │                     │
                 MicroGoal             MicroGoal             MicroGoal
                     │                     │                     │
                 NanoGoal              NanoGoal              NanoGoal
```

## Data Flow: Creating a Practice Session

```
Step 1: User selects Short-Term Goals
┌─────────────────────────────────────┐
│ Short-Term Goals Selected:          │
│ ✓ "Learn React" (id: stg-001)      │
│ ✓ "Build Portfolio" (id: stg-002)  │
│ ✓ "Study Design" (id: stg-003)     │
└─────────────────────────────────────┘
                 ↓
Step 2: Create Practice Session
┌─────────────────────────────────────┐
│ practice_sessions table             │
├─────────────────────────────────────┤
│ INSERT:                             │
│ id: ps-001                          │
│ name: "Practice Session 1 - ..."   │
│ description: "Focus on React..."    │
│ created_at: 2025-12-21 15:40:00    │
└─────────────────────────────────────┘
                 ↓
Step 3: Create Relationships
┌─────────────────────────────────────┐
│ practice_session_goals table        │
├─────────────────────────────────────┤
│ INSERT:                             │
│ (ps-001, stg-001)                  │
│ (ps-001, stg-002)                  │
│ (ps-001, stg-003)                  │
└─────────────────────────────────────┘
                 ↓
Step 4: Create Immediate Goals
┌─────────────────────────────────────┐
│ goals table                         │
├─────────────────────────────────────┤
│ INSERT:                             │
│ id: ig-001                          │
│ type: ImmediateGoal                 │
│ name: "Complete feature X"          │
│ parent_id: ps-001 ←────────────────┐│
│                                     ││
│ id: ig-002                          ││
│ type: ImmediateGoal                 ││
│ name: "Review code"                 ││
│ parent_id: ps-001 ←────────────────┘│
└─────────────────────────────────────┘
```

## Query Examples with Results

### Query 1: Get Practice Session with Parents

```sql
SELECT 
    ps.id,
    ps.name,
    GROUP_CONCAT(g.name) as parent_goal_names
FROM practice_sessions ps
LEFT JOIN practice_session_goals psg ON ps.id = psg.practice_session_id
LEFT JOIN goals g ON psg.short_term_goal_id = g.id
WHERE ps.id = 'ps-001'
GROUP BY ps.id;
```

**Result:**
```
┌────────┬──────────────────────────────┬─────────────────────────────────────────┐
│ id     │ name                         │ parent_goal_names                       │
├────────┼──────────────────────────────┼─────────────────────────────────────────┤
│ ps-001 │ Practice Session 1 - 12/21   │ Learn React,Build Portfolio,Study Design│
└────────┴──────────────────────────────┴─────────────────────────────────────────┘
```

### Query 2: Get All Sessions for a Goal

```sql
SELECT 
    ps.id,
    ps.name,
    ps.created_at
FROM practice_sessions ps
JOIN practice_session_goals psg ON ps.id = psg.practice_session_id
WHERE psg.short_term_goal_id = 'stg-001'
ORDER BY ps.created_at DESC;
```

**Result:**
```
┌────────┬──────────────────────────────┬─────────────────────┐
│ id     │ name                         │ created_at          │
├────────┼──────────────────────────────┼─────────────────────┤
│ ps-003 │ Practice Session 3 - 12/23   │ 2025-12-23 10:00:00│
│ ps-001 │ Practice Session 1 - 12/21   │ 2025-12-21 15:40:00│
└────────┴──────────────────────────────┴─────────────────────┘
```

### Query 3: Get Complete Session with All Related Data

```sql
SELECT 
    ps.id,
    ps.name,
    ps.description,
    -- Parent goals (many-to-many)
    (SELECT json_group_array(json_object('id', g.id, 'name', g.name))
     FROM practice_session_goals psg
     JOIN goals g ON psg.short_term_goal_id = g.id
     WHERE psg.practice_session_id = ps.id) as parent_goals,
    -- Immediate goals (one-to-many)
    (SELECT json_group_array(json_object('id', g.id, 'name', g.name))
     FROM goals g
     WHERE g.parent_id = ps.id AND g.type = 'ImmediateGoal') as immediate_goals
FROM practice_sessions ps
WHERE ps.id = 'ps-001';
```

**Result:**
```json
{
  "id": "ps-001",
  "name": "Practice Session 1 - 12/21/2025",
  "description": "Focus on React and design",
  "parent_goals": [
    {"id": "stg-001", "name": "Learn React"},
    {"id": "stg-002", "name": "Build Portfolio"},
    {"id": "stg-003", "name": "Study Design"}
  ],
  "immediate_goals": [
    {"id": "ig-001", "name": "Complete feature X"},
    {"id": "ig-002", "name": "Review code"}
  ]
}
```

## Future Extensibility Examples

### Adding Session Duration Tracking

```sql
-- Add column to practice_sessions
ALTER TABLE practice_sessions ADD COLUMN duration INTEGER;
ALTER TABLE practice_sessions ADD COLUMN actual_start_time TIMESTAMP;
ALTER TABLE practice_sessions ADD COLUMN actual_end_time TIMESTAMP;

-- Update a session
UPDATE practice_sessions 
SET duration = 90,  -- 90 minutes
    actual_start_time = '2025-12-21 15:00:00',
    actual_end_time = '2025-12-21 16:30:00'
WHERE id = 'ps-001';
```

### Adding Focus Score

```sql
-- Add column
ALTER TABLE practice_sessions ADD COLUMN focus_score INTEGER CHECK(focus_score BETWEEN 1 AND 10);

-- Query average focus score per goal
SELECT 
    g.name as goal_name,
    AVG(ps.focus_score) as avg_focus,
    COUNT(ps.id) as session_count
FROM goals g
JOIN practice_session_goals psg ON g.id = psg.short_term_goal_id
JOIN practice_sessions ps ON psg.practice_session_id = ps.id
WHERE g.type = 'ShortTermGoal'
GROUP BY g.id
ORDER BY avg_focus DESC;
```

### Adding Session Tags

```sql
-- Add column
ALTER TABLE practice_sessions ADD COLUMN tags TEXT;  -- Comma-separated

-- Update
UPDATE practice_sessions 
SET tags = 'deep-work,morning,focused'
WHERE id = 'ps-001';

-- Query sessions by tag
SELECT * FROM practice_sessions 
WHERE tags LIKE '%deep-work%';
```

## Comparison: Before vs After

### Before (JSON with parent_ids array)
```json
{
  "name": "Practice Session 1",
  "id": "ps-001",
  "attributes": {
    "type": "PracticeSession",
    "parent_ids": ["stg-001", "stg-002", "stg-003"]
  },
  "children": [...]
}
```

**Issues:**
- ❌ Can't add session-specific fields easily
- ❌ Mixed with goal data
- ❌ Hard to query sessions independently
- ❌ No referential integrity

### After (Separate practice_sessions table)
```sql
-- practice_sessions table
ps-001 | Practice Session 1 | ... | duration: 90 | focus: 8

-- practice_session_goals junction
ps-001 | stg-001
ps-001 | stg-002
ps-001 | stg-003
```

**Benefits:**
- ✅ Easy to add session-specific fields
- ✅ Clean separation from goals
- ✅ Efficient session queries
- ✅ Foreign key constraints
- ✅ Can track session metrics
- ✅ Future-proof for features
