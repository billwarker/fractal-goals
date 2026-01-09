# Notes System Design — Sessions & Activity Instances

**Date:** 2026-01-09  
**Status:** Draft for Review  
**Purpose:** Design document for enhanced note-taking functionality

---

## Table of Contents

1. [Current State](#current-state)
2. [Use Cases & Requirements](#use-cases--requirements)
3. [Data Model Options](#data-model-options)
4. [Frontend UI Options](#frontend-ui-options)
5. [Recommended Approach](#recommended-approach)

---

## Current State

### What Exists Today

**Activity Instance Notes:**
- Single `notes` field (String) on `ActivityInstance` table
- Simple text input in `SessionActivityItem.jsx` (line 481-487)
- Displays inline as a single-line text field with placeholder "Notes..."

```jsx
// Current implementation in SessionActivityItem.jsx
<input
    type="text"
    placeholder="Notes..."
    value={exercise.notes || ''}
    onChange={(e) => onUpdate('notes', e.target.value)}
    style={{ ... }}
/>
```

**Program Day Notes:**
- Single `notes` field (Text) on `ProgramDay` table
- Used for day-level planning notes

**Session Notes:**
- Stored in `session.attributes` JSON as `notes` field
- No dedicated input field in SessionDetail view

### Current Limitations

1. **Single note per activity** — Can't add multiple timestamped observations
2. **No note history** — Notes overwrite, no revision tracking
3. **No aggregation** — Can't see all notes from a session in one place
4. **No cross-reference** — Can't easily see notes from previous instances of the same activity
5. **Poor visibility** — Notes are hidden in collapsed sections
6. **No set-level notes** — Can't add notes per set (e.g., "felt easy", "struggled on last rep")

---

## Use Cases & Requirements

### Primary Use Cases

| # | Use Case | User Story |
|---|----------|------------|
| 1 | **Quick capture during activity** | "While doing an exercise, I want to quickly jot down how it felt" |
| 2 | **Session reflection** | "After completing a session, I want to add overall observations" |
| 3 | **Review past performance** | "Before today's session, I want to see notes from last time I did this activity" |
| 4 | **Track issues over time** | "I want to see if my shoulder pain notes correlate with certain activities" |
| 5 | **Per-set observations** | "I want to note that set 3 was too heavy, but set 4 with reduced weight felt good" |

### Requirements Matrix

| Requirement | Priority | Complexity |
|-------------|----------|------------|
| Multiple notes per activity instance | High | Low |
| Timestamped notes | High | Low |
| Session-level notes | High | Low |
| Set-level notes | Medium | Medium |
| View previous instance notes | Medium | Medium |
| Note aggregation (session summary) | Medium | Low |
| Note tagging/categorization | Low | Medium |
| Note search | Low | High |
| Rich text formatting | Low | High |

---

## Data Model Options

### Option A: Dedicated Notes Table (Recommended)

**New `notes` Table:**

```python
class Note(Base):
    __tablename__ = 'notes'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    
    # Polymorphic context - what is this note attached to?
    context_type = Column(String, nullable=False)  # 'session', 'activity_instance', 'set', 'goal', 'calendar_day'
    context_id = Column(String, nullable=False, index=True)  # ID of the parent entity
    
    # Optional parent references for efficient querying
    session_id = Column(String, ForeignKey('sessions.id'), nullable=True, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id'), nullable=True, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=True, index=True)
    
    # For set-level notes
    set_index = Column(Integer, nullable=True)  # 0-indexed set number
    
    # Content
    content = Column(Text, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "context_type": self.context_type,
            "context_id": self.context_id,
            "session_id": self.session_id,
            "activity_instance_id": self.activity_instance_id,
            "activity_definition_id": self.activity_definition_id,
            "set_index": self.set_index,
            "content": self.content,
            "created_at": format_utc(self.created_at),
            "updated_at": format_utc(self.updated_at)
        }
```

**Pros:**
- ✅ Unlimited notes per entity
- ✅ Timestamps preserved
- ✅ Enables cross-activity querying ("all notes for Squats")
- ✅ Scalable to other entities (goals, calendar days)
- ✅ Clean separation of concerns

**Cons:**
- ❌ Requires new table + migration
- ❌ Additional API endpoints needed
- ❌ More complex queries for aggregation

---

### Option B: JSON Array on Existing Tables

**Modify `activity_instances.notes` to store JSON array:**

```python
# Instead of: notes = Column(String)
# Use:
notes_json = Column(Text, nullable=True)  # JSON array of note objects

# Example stored data:
[
    {"id": "abc123", "content": "Felt strong today", "created_at": "2026-01-09T10:30:00Z"},
    {"id": "def456", "content": "Slight twinge in left shoulder", "created_at": "2026-01-09T10:32:00Z", "set_index": 2}
]
```

**Pros:**
- ✅ No schema change (just interpret existing field differently)
- ✅ Notes stay with their parent
- ✅ Simpler queries for single entity

**Cons:**
- ❌ Can't query across notes efficiently
- ❌ JSON parsing overhead
- ❌ No referential integrity
- ❌ Harder to find "all notes for this activity definition"

---

### Option C: Hybrid — Set-Level in JSON, General Notes in Table

**Keep sets with inline notes, add dedicated table for activity/session notes:**

```python
# activity_instances.data already has:
{
    "sets": [
        {"instance_id": "...", "metrics": [...], "note": "Too heavy"},  # Set-level note inline
        {"instance_id": "...", "metrics": [...], "note": "Perfect"}
    ]
}

# Plus dedicated notes table for session/activity instance level notes
```

**Pros:**
- ✅ Set notes stay with set data (natural grouping)
- ✅ Timeline notes in dedicated table
- ✅ Best of both worlds

**Cons:**
- ❌ Two places to look for notes
- ❌ Inconsistent mental model

---

## Frontend UI Options

### Option 1: Collapsible Notes Panel per Activity

**Design:** Expand/collapse panel below the activity with all notes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▲▼  🏋️ Barbell Squat (Activity)                    Start | Stop | Duration │
├─────────────────────────────────────────────────────────────────────────────┤
│ Set #1  [Weight: 135 lb] [Reps: 8]                                          │
│ Set #2  [Weight: 155 lb] [Reps: 8]                                          │
│ Set #3  [Weight: 175 lb] [Reps: 6]                                          │
│ + Add Set                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📝 Notes (2)                                                         [−/+]  │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 10:32 AM - Slight twinge in left shoulder on set 3                      │ │
│ │ 10:35 AM - Reduced weight, felt better                                  │ │
│ │                                                                         │ │
│ │ [+] Add note...                                                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Notes visible in context
- ✅ Easy to add while exercising
- ✅ Timestamped entries clear

**Cons:**
- ❌ Takes vertical space
- ❌ Hard to see all notes across session

---

### Option 2: Side Panel Notes (Contextual Drawer)

**Design:** Global side panel that shows notes for currently selected item

```
┌────────────────────────────────────────────┬──────────────────────────────────┐
│                                            │  📝 NOTES                        │
│  SESSION DETAIL VIEW                       │  ─────────────────────────────── │
│                                            │  Session: Morning Workout        │
│  ┌──────────────────────────────────────┐  │  ─────────────────────────────── │
│  │ 🏋️ Barbell Squat ←─── SELECTED ──────┼──┤  ▼ Barbell Squat (3 notes)      │
│  │ Set #1, Set #2, Set #3               │  │    10:32 - Slight twinge...     │
│  │ Duration: 8:45                       │  │    10:35 - Reduced weight...    │
│  └──────────────────────────────────────┘  │    10:40 - Strong finish        │
│                                            │                                  │
│  ┌──────────────────────────────────────┐  │  ▶ Bench Press (1 note)         │
│  │ 🏋️ Bench Press                       │  │                                  │
│  │ Set #1, Set #2, Set #3               │  │  ▶ Previous Sessions            │
│  └──────────────────────────────────────┘  │    > Jan 7: 2 notes             │
│                                            │    > Jan 5: 1 note              │
│                                            │  ─────────────────────────────── │
│                                            │  [+] Add note...                 │
└────────────────────────────────────────────┴──────────────────────────────────┘
```

**Pros:**
- ✅ Doesn't clutter main view
- ✅ Can show previous session notes
- ✅ Aggregates all session notes in one place
- ✅ Natural fit with existing SidePane work (from conversation history)

**Cons:**
- ❌ Requires selection context
- ❌ Harder to quick-add while focused on activity

---

### Option 3: Inline Note Indicator + Modal Detail

**Design:** Show note count badge, click to open modal with full notes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▲▼  🏋️ Barbell Squat (Activity)  [📝 3]            Start | Stop | Duration │
├─────────────────────────────────────────────────────────────────────────────┤
│ Set #1  [Weight: 135 lb] [Reps: 8]  [💬 1]                                  │
│ Set #2  [Weight: 155 lb] [Reps: 8]                                          │
│ Set #3  [Weight: 175 lb] [Reps: 6]  [💬 2]                                  │
└─────────────────────────────────────────────────────────────────────────────┘

─────────────── CLICKED [📝 3] ───────────────────────────────────────────────

┌───────────────────────────────────────────────────────────────────┐
│                      📝 Barbell Squat Notes                       │
├───────────────────────────────────────────────────────────────────┤
│  TODAY (Jan 9, 2026)                                              │
│  ───────────────────────────────────────────────────────────────  │
│  10:32 AM [Set 3] - Slight twinge in left shoulder                │
│  10:35 AM [Set 3] - Reduced weight, felt better                   │
│  10:40 AM - Strong finish overall                                 │
│  ───────────────────────────────────────────────────────────────  │
│  PREVIOUS SESSIONS                                                │
│  ───────────────────────────────────────────────────────────────  │
│  ▶ Jan 7 - "Good form maintained throughout"                     │
│  ▶ Jan 5 - "Struggled with depth at higher weights"              │
│  ───────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ [Set: ▼ None] [                                          ]  │  │
│  │                                              [Add Note ✓]   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                         [Close]   │
└───────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Compact main view
- ✅ Full history visible in modal
- ✅ Set-level granularity
- ✅ Previous session notes visible

**Cons:**
- ❌ Extra click to add note
- ❌ Modal interrupts flow

---

### Option 4: Quick-Add + Timeline (Hybrid)

**Design:** Quick text input always visible, notes display as timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▲▼  🏋️ Barbell Squat (Activity)                    Start | Stop | Duration │
├─────────────────────────────────────────────────────────────────────────────┤
│ Set #1  [Weight: 135 lb] [Reps: 8]                                          │
│ Set #2  [Weight: 155 lb] [Reps: 8]                                          │
│ Set #3  [Weight: 175 lb] [Reps: 6]                                          │
│ + Add Set                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Quick note: [Type here, press Enter to add...                    ] [📝 Add] │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📝 10:40 - Strong finish overall                                    × Edit  │
│ 📝 10:35 - Reduced weight, felt better [Set 3]                      × Edit  │
│ 📝 10:32 - Slight twinge in left shoulder [Set 3]                   × Edit  │
│                                                    [View history from 📅 ↗] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Minimal friction to add notes
- ✅ Recent notes immediately visible
- ✅ Historical notes one click away
- ✅ Good balance of visibility and space

**Cons:**
- ❌ More vertical space per activity
- ❌ May overwhelm for activities with many notes

---

### Option 5: Session-Level Notes Panel

**Design:** Single notes panel at session level with activity tagging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MORNING WORKOUT - Jan 9, 2026                        │
│                     Template: Upper Body Strength                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ [SECTION: Warm-up]                                                          │
│   ├── Arm Circles (2 min)                                                   │
│   └── Band Pull-aparts (3x15)                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ [SECTION: Main Lifts]                                                       │
│   ├── Barbell Squat (3 sets)                                                │
│   └── Bench Press (3 sets)                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📒 SESSION NOTES                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 10:32 [Barbell Squat] - Slight twinge in left shoulder on set 3        │ │
│ │ 10:35 [Barbell Squat] - Reduced weight, felt better                    │ │
│ │ 10:40 [Barbell Squat] - Strong finish                                  │ │
│ │ 10:55 [Bench Press] - Grip felt off today                              │ │
│ │ 11:05 [Session] - Overall energy was good, slept well last night       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ [Activity: ▼ Session] [Set: ▼ -] [                                  ]  │ │
│ │                                                         [Add Note ✓]   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Single place for all notes
- ✅ Clear chronological timeline
- ✅ Context tags for filtering
- ✅ Works well with session reflection use case

**Cons:**
- ❌ Notes disconnected from activity visually
- ❌ Need to scroll to add notes during workout

---

## Recommended Approach

### Data Model: Option A (Dedicated Notes Table)

**Why:** Provides maximum flexibility for future features (note search, cross-activity analysis, tagging) while maintaining clean separation.

**Schema:**
```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL REFERENCES goals(id),
    context_type TEXT NOT NULL,  -- 'session', 'activity_instance', 'set', 'goal'
    context_id TEXT NOT NULL,
    session_id TEXT REFERENCES sessions(id),
    activity_instance_id TEXT REFERENCES activity_instances(id),
    activity_definition_id TEXT REFERENCES activity_definitions(id),
    set_index INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE INDEX idx_notes_context ON notes(context_type, context_id);
CREATE INDEX idx_notes_session ON notes(session_id);
CREATE INDEX idx_notes_activity_def ON notes(activity_definition_id);
```

### Frontend: Option 4 (Quick-Add + Timeline)

**Why:** Best balance of speed (low friction to add) and visibility (recent notes shown) with progressive disclosure (history behind a click).

### API Endpoints

```python
# New endpoints in blueprints/notes_api.py

# Get all notes for a session (includes activity instance notes)
GET /api/<root_id>/sessions/<session_id>/notes

# Get notes for a specific activity instance
GET /api/<root_id>/activity-instances/<instance_id>/notes

# Get notes for an activity definition (across all sessions)
GET /api/<root_id>/activities/<activity_id>/notes?limit=10

# Create a note
POST /api/<root_id>/notes
{
    "context_type": "activity_instance",
    "context_id": "<instance_id>",
    "content": "Felt strong today",
    "set_index": null  // optional
}

# Update a note
PUT /api/<root_id>/notes/<note_id>

# Delete a note
DELETE /api/<root_id>/notes/<note_id>
```

### Frontend Components

```
components/notes/
├── NoteInput.jsx           # Quick-add input with auto-timestamp
├── NoteTimeline.jsx        # Chronological list of notes
├── NoteItem.jsx            # Single note with edit/delete
├── ActivityNotesPanel.jsx  # Panel for activity-level notes
├── SessionNotesPanel.jsx   # Panel for session-level notes
└── NoteHistoryModal.jsx    # Modal showing previous session notes
```

---

## Implementation Phases

### Phase 1: Foundation (2-3 days)
- [ ] Create `notes` table
- [ ] Add `notes_api.py` blueprint
- [ ] Create `NoteInput.jsx` component
- [ ] Create `NoteItem.jsx` component
- [ ] Add notes panel to `SessionActivityItem.jsx`

### Phase 2: Session Notes (1-2 days)
- [ ] Add session-level notes panel to `SessionDetail.jsx`
- [ ] Create `NoteTimeline.jsx` for session aggregation
- [ ] Filter by activity/set

### Phase 3: History (1-2 days)
- [ ] Add "View previous notes" endpoint
- [ ] Create `NoteHistoryModal.jsx`
- [ ] Link from activity notes panel

### Phase 4: Polish (1 day)
- [ ] Note edit inline
- [ ] Note delete with confirmation
- [ ] Keyboard shortcuts (Enter to add)
- [ ] Optimistic UI updates

---

## Questions for Stakeholder

1. **Set granularity:** Do you need notes per-set, or is activity-level sufficient?
2. **Rich text:** Do you need formatting (bold, lists) or is plain text fine?
3. **Tags/categories:** Would you want to tag notes (e.g., #pain, #form, #energy)?
4. **Visibility:** Should notes be visible in the Sessions list view, or only in detail?
5. **Side panel:** The previous conversation mentioned a Global SidePane — should notes be part of that, or stay inline?

---

**Next Steps:**
1. Review this document
2. Answer the questions above
3. Generate UI mockups if desired
4. Begin Phase 1 implementation

