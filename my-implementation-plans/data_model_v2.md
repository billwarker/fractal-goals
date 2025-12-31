# Data Model Improvements for Production (v2)

## Hierarchy
1.  **Program**: The overarching container (e.g., "Marathon 2024").
2.  **ProgramBlock**: Distinct phases within a program (e.g., "Base Builder", "Peak").
3.  **ProgramDay**: A specific day within a block.
4.  **ScheduledSession**: The actual workout(s) performed on a day.

*Note: Goals can be assigned to both Programs and ProgramBlocks.*

## Issues with Current JSON Approach
1.  **Concurrency Conflicts**: Updating a single day overwrites the entire program blob.
2.  **Query Limitations**: Cannot efficiently query specific days or filter blocks by goal.
3.  **Scalability**: Large programs create massive JSON payloads.

## Proposed Relational Schema

### 1. `program_blocks` Table
Renamed from *TrainingBlock*. Represents a phase.

```python
class ProgramBlock(Base):
    __tablename__ = 'program_blocks'
    
    id = Column(String, primary_key=True)
    program_id = Column(String, ForeignKey('programs.id'), nullable=False)
    
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    color = Column(String)
    
    # New: Goals assigned to this specific block
    goal_ids = Column(Text) # JSON List of Goal IDs specific to this block
    
    # Relationship
    program = relationship("Program", back_populates="blocks")
    days = relationship("ProgramDay", back_populates="block", cascade="all, delete-orphan")
```

### 2. `program_days` Table
**New Entity**. Represents a specific day. Allows storing day-specific notes, readiness scores, or day-level focus, and acts as container for sessions.

```python
class ProgramDay(Base):
    __tablename__ = 'program_days'
    
    id = Column(String, primary_key=True)
    block_id = Column(String, ForeignKey('program_blocks.id'), nullable=False)
    
    date = Column(Date, nullable=False)
    name = Column(String) # Optional, e.g., "Long Run Day"
    notes = Column(Text)  # Daily notes
    
    # Relationship
    block = relationship("ProgramBlock", back_populates="days")
    sessions = relationship("ScheduledSession", back_populates="day", cascade="all, delete-orphan")
```

### 3. `scheduled_sessions` Table
The actual unit of work.

```python
class ScheduledSession(Base):
    __tablename__ = 'scheduled_sessions'
    
    id = Column(String, primary_key=True)
    day_id = Column(String, ForeignKey('program_days.id'), nullable=False)
    
    session_template_id = Column(String, ForeignKey('session_templates.id'), nullable=True)
    
    is_completed = Column(Boolean, default=False)
    completion_data = Column(Text) # JSON for specific stats (RPE, time)
    
    # Relationship
    day = relationship("ProgramDay", back_populates="sessions")
    template = relationship("SessionTemplate")
```

## Migration Strategy
1.  **Phase 1 (Schema)**: Create new tables (`program_blocks`, `program_days`, `scheduled_sessions`).
2.  **Phase 2 (Migration)**:
    *   Iterate existing `Programs`.
    *   Parse `weekly_schedule` JSON.
    *   Create `ProgramBlock` for each phase found in JSON.
    *   For every calendar date in that block, create a `ProgramDay`.
    *   If the JSON assigns a template to that day/weekday, create a `ScheduledSession` linked to that `ProgramDay`.
3.  **Phase 3 (Code)**: Update API to read/write to these tables. Deprecate `Program.weekly_schedule` column.

## Benefits
*   **Granular Goal Tracking**: You can link specific goals to specific blocks (e.g., "Increase Squat" goal linked to "Strength Block").
*   **Multi-Session Days**: The `ProgramDay` -> `ScheduledSession` (1:N) relationship natively supports AM/PM workouts.
*   **Rich Day Data**: You can track "Morning Readiness" or "Daily Notes" on the `ProgramDay` entity without polluting the session data.
