# Database Schema Visual Reference

## Table Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        goals                                 │
├─────────────────────────────────────────────────────────────┤
│ id (PK)              TEXT                                    │
│ type                 TEXT    ('UltimateGoal', 'Practice...') │
│ name                 TEXT                                    │
│ description          TEXT                                    │
│ deadline             DATE                                    │
│ completed            BOOLEAN                                 │
│ created_at           TIMESTAMP                               │
│ parent_id (FK)       TEXT    → goals.id                      │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │
                              │ (tree structure)
                              │
┌─────────────────────────────────────────────────────────────┐
│              practice_session_parents                        │
│                  (Junction Table)                            │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                    INTEGER AUTO                      │
│ practice_session_id (FK)   TEXT → goals.id                   │
│ short_term_goal_id (FK)    TEXT → goals.id                   │
│ created_at                 TIMESTAMP                         │
│                                                              │
│ UNIQUE(practice_session_id, short_term_goal_id)             │
└─────────────────────────────────────────────────────────────┘
```

## Relationship Diagram

```
Ultimate Goal (root)
    │
    ├─→ Long Term Goal
    │       │
    │       ├─→ Mid Term Goal
    │       │       │
    │       │       └─→ Short Term Goal ──┐
    │       │                              │
    │       └─→ Mid Term Goal              │
    │               │                      │
    │               └─→ Short Term Goal ──┤
    │                                      │
    └─→ Long Term Goal                     │ (many-to-many via junction table)
            │                              │
            └─→ Mid Term Goal              │
                    │                      │
                    └─→ Short Term Goal ──┘
                                           │
                                           ↓
                                    Practice Session
                                           │
                                           ├─→ Immediate Goal
                                           │       │
                                           │       └─→ Micro Goal
                                           │               │
                                           │               └─→ Nano Goal
                                           │
                                           └─→ Immediate Goal
                                                   │
                                                   └─→ Micro Goal
```

## Data Flow Example

### Creating a Practice Session with Multiple Parents

```
1. User selects Short Term Goals:
   - "Learn React" (id: abc123)
   - "Build Portfolio" (id: def456)
   - "Study Design" (id: ghi789)

2. Backend creates Practice Session:
   INSERT INTO goals (id, type, name, ...)
   VALUES ('ps001', 'PracticeSession', 'Practice Session 1 - 12/21/2025', ...)

3. Backend creates relationships:
   INSERT INTO practice_session_parents (practice_session_id, short_term_goal_id)
   VALUES 
     ('ps001', 'abc123'),
     ('ps001', 'def456'),
     ('ps001', 'ghi789')

4. Backend creates Immediate Goals:
   INSERT INTO goals (id, type, name, parent_id, ...)
   VALUES 
     ('ig001', 'ImmediateGoal', 'Complete feature X', 'ps001', ...),
     ('ig002', 'ImmediateGoal', 'Review code', 'ps001', ...)
```

### Querying Practice Session with Parents

```sql
-- Get practice session with all parent goals
SELECT 
    ps.id as session_id,
    ps.name as session_name,
    json_group_array(
        json_object(
            'id', stg.id,
            'name', stg.name,
            'type', stg.type
        )
    ) as parent_goals
FROM goals ps
LEFT JOIN practice_session_parents psp ON ps.id = psp.practice_session_id
LEFT JOIN goals stg ON psp.short_term_goal_id = stg.id
WHERE ps.id = 'ps001'
GROUP BY ps.id;

-- Result:
{
  "session_id": "ps001",
  "session_name": "Practice Session 1 - 12/21/2025",
  "parent_goals": [
    {"id": "abc123", "name": "Learn React", "type": "ShortTermGoal"},
    {"id": "def456", "name": "Build Portfolio", "type": "ShortTermGoal"},
    {"id": "ghi789", "name": "Study Design", "type": "ShortTermGoal"}
  ]
}
```

## Comparison: JSON vs SQLite

### Current JSON Approach
```json
{
  "name": "Practice Session 1",
  "id": "ps001",
  "attributes": {
    "type": "PracticeSession",
    "parent_ids": ["abc123", "def456", "ghi789"]
  },
  "children": [...]
}
```

**Issues:**
- ❌ No referential integrity
- ❌ Hard to query relationships
- ❌ Must load entire file to find one goal
- ❌ Risk of data corruption
- ❌ No concurrent access support

### SQLite Approach
```sql
-- goals table
ps001 | PracticeSession | Practice Session 1 | ... | NULL

-- practice_session_parents table
ps001 | abc123
ps001 | def456
ps001 | ghi789
```

**Benefits:**
- ✅ Referential integrity (foreign keys)
- ✅ Efficient queries (indexes)
- ✅ Partial data loading
- ✅ ACID transactions
- ✅ Concurrent access
- ✅ Easy backups
- ✅ Data validation

## Migration Path

```
goals_db.json  →  [Migration Script]  →  goals.db
                                            │
                                            ├─→ goals table
                                            └─→ practice_session_parents table
```

Keep JSON as backup until SQLite is proven stable.
