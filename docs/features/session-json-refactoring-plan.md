# Practice Session JSON Structure Refactoring Plan

## Overview

Refactor practice sessions to use a flexible JSON structure that can be populated from templates created via the "Create Session Template" endpoint (formerly "Programming").

## Current Architecture

**Practice Sessions:**
- Stored in `practice_sessions` table
- Fields: `id`, `name`, `description`, `completed`, `created_at`, `root_id`
- Immediate goals stored separately in `goals` table with `parent_id` pointing to session
- Junction table `practice_session_goals` links sessions to short-term goals

**Problems:**
- Rigid structure
- Can't store custom session data
- No template system
- Limited extensibility

## New Architecture

### 1. Database Schema Changes

**Add `session_data` JSON column to `practice_sessions` table:**

```python
class PracticeSession(Base):
    __tablename__ = 'practice_sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    root_id = Column(String, ForeignKey('goals.id'), nullable=True)
    
    # NEW: JSON structure for session data
    session_data = Column(JSON, nullable=True)
    # Structure: {
    #   "template_id": "uuid",
    #   "template_name": "Guitar Practice Template",
    #   "sections": [
    #     {
    #       "name": "Warm-up",
    #       "duration_minutes": 10,
    #       "exercises": [
    #         {"name": "Chromatic scales", "completed": false, "notes": ""}
    #       ]
    #     },
    #     {
    #       "name": "Technique",
    #       "duration_minutes": 20,
    #       "exercises": [...]
    #     }
    #   ],
    #   "notes": "",
    #   "total_duration_minutes": 60,
    #   "actual_duration_minutes": null,
    #   "focus_score": null,
    #   "energy_level": null
    # }
    
    # Keep existing relationships
    parent_goals = relationship("Goal", secondary=practice_session_goals, backref="linked_practice_sessions")
```

### 2. Session Templates

**Create new `SessionTemplate` model:**

```python
class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Template structure
    template_data = Column(JSON, nullable=False)
    # Structure: {
    #   "sections": [
    #     {
    #       "name": "Warm-up",
    #       "duration_minutes": 10,
    #       "exercises": [
    #         {"name": "Chromatic scales", "description": "Up and down the neck"}
    #       ]
    #     }
    #   ],
    #   "total_duration_minutes": 60,
    #   "tags": ["guitar", "technique", "scales"]
    # }
```

### 3. API Endpoints

**Session Templates (formerly "Programming"):**

```python
# Create template
POST /api/<root_id>/session-templates
{
  "name": "Guitar Practice Template",
  "description": "Daily guitar practice routine",
  "template_data": {
    "sections": [...],
    "total_duration_minutes": 60
  }
}

# Get all templates for fractal
GET /api/<root_id>/session-templates

# Get specific template
GET /api/<root_id>/session-templates/<template_id>

# Update template
PUT /api/<root_id>/session-templates/<template_id>

# Delete template
DELETE /api/<root_id>/session-templates/<template_id>
```

**Practice Sessions (updated):**

```python
# Create session from template
POST /api/<root_id>/sessions
{
  "template_id": "uuid",  # Optional - use template
  "parent_ids": ["short-term-goal-1", "short-term-goal-2"],
  "session_data": {  # Pre-populated from template, can be modified
    "sections": [...],
    "notes": "Focused on speed today"
  }
}

# Or create blank session
POST /api/<root_id>/sessions
{
  "parent_ids": ["short-term-goal-1"],
  "name": "Quick Practice",
  "description": "Short session",
  "session_data": null  # No template
}

# Update session (including session_data)
PUT /api/<root_id>/sessions/<session_id>
{
  "session_data": {
    "sections": [...],
    "actual_duration_minutes": 55,
    "focus_score": 8,
    "notes": "Great session!"
  }
}
```

### 4. Frontend Changes

**Create Session Template Page (`/:rootId/create-session-template`):**

```javascript
// Template builder UI
- Name and description
- Add/remove sections
- Add/remove exercises within sections
- Set duration for each section
- Save as template
```

**Sessions Page Updates:**

```javascript
// Display session data in table view
<table>
  <thead>
    <tr>
      <th>Session Name</th>
      <th>Date</th>
      <th>Duration</th>
      <th>Sections</th>
      <th>Completed</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {sessions.map(session => (
      <tr>
        <td>{session.name}</td>
        <td>{formatDate(session.created_at)}</td>
        <td>{session.session_data?.actual_duration_minutes || session.session_data?.total_duration_minutes}m</td>
        <td>{session.session_data?.sections?.length || 0}</td>
        <td>{session.completed ? '✓' : '○'}</td>
        <td><button>View Details</button></td>
      </tr>
    ))}
  </tbody>
</table>
```

**Log Page Updates:**

```javascript
// Add template selection
1. Select template (optional)
2. Select short-term goals
3. Customize session data (if template selected)
4. Add notes
5. Submit
```

## Implementation Steps

### Phase 1: Database Migration

1. ✅ Add `session_data` column to `practice_sessions` table
2. ✅ Create `session_templates` table
3. ✅ Create migration script to add columns to existing database
4. ✅ Update `models.py` with new schema

### Phase 2: Backend - Session Templates

1. ✅ Create `SessionTemplate` model in `models.py`
2. ✅ Add template CRUD endpoints to `blueprints/api.py`
3. ✅ Add template validation logic
4. ✅ Update session creation to support templates

### Phase 3: Backend - Practice Sessions

1. ✅ Update `PracticeSession.to_dict()` to include `session_data`
2. ✅ Update session creation endpoint to accept `template_id`
3. ✅ Update session update endpoint to handle `session_data`
4. ✅ Add helper functions for template instantiation

### Phase 4: Frontend - Template Builder

1. ✅ Rename "Programming" to "Create Session Template"
2. ✅ Create template builder UI
3. ✅ Add section/exercise management
4. ✅ Save/load templates

### Phase 5: Frontend - Sessions Page

1. ✅ Update to table view
2. ✅ Display session data from JSON
3. ✅ Add detailed view modal
4. ✅ Show section completion status

### Phase 6: Frontend - Log Page

1. ✅ Add template selection dropdown
2. ✅ Pre-populate session data from template
3. ✅ Allow customization of session data
4. ✅ Update submission to include session_data

## JSON Structure Examples

### Template Example:

```json
{
  "name": "Guitar Practice Template",
  "description": "Daily routine for guitar practice",
  "template_data": {
    "sections": [
      {
        "name": "Warm-up",
        "duration_minutes": 10,
        "exercises": [
          {
            "name": "Chromatic scales",
            "description": "Up and down the neck, all strings"
          },
          {
            "name": "Finger stretches",
            "description": "1-2-3-4 pattern"
          }
        ]
      },
      {
        "name": "Technique",
        "duration_minutes": 20,
        "exercises": [
          {
            "name": "Alternate picking",
            "description": "Metronome at 120 BPM"
          },
          {
            "name": "Legato runs",
            "description": "Focus on smooth transitions"
          }
        ]
      },
      {
        "name": "Song Practice",
        "duration_minutes": 30,
        "exercises": [
          {
            "name": "Crazy Train intro",
            "description": "Work on speed and accuracy"
          }
        ]
      }
    ],
    "total_duration_minutes": 60,
    "tags": ["guitar", "technique", "songs"]
  }
}
```

### Session Instance Example:

```json
{
  "template_id": "abc-123",
  "template_name": "Guitar Practice Template",
  "sections": [
    {
      "name": "Warm-up",
      "duration_minutes": 10,
      "actual_duration_minutes": 12,
      "exercises": [
        {
          "name": "Chromatic scales",
          "description": "Up and down the neck, all strings",
          "completed": true,
          "notes": "Felt good today"
        },
        {
          "name": "Finger stretches",
          "description": "1-2-3-4 pattern",
          "completed": true,
          "notes": ""
        }
      ]
    },
    {
      "name": "Technique",
      "duration_minutes": 20,
      "actual_duration_minutes": 18,
      "exercises": [
        {
          "name": "Alternate picking",
          "description": "Metronome at 120 BPM",
          "completed": true,
          "notes": "Struggled with speed"
        },
        {
          "name": "Legato runs",
          "description": "Focus on smooth transitions",
          "completed": false,
          "notes": "Ran out of time"
        }
      ]
    }
  ],
  "total_duration_minutes": 60,
  "actual_duration_minutes": 55,
  "focus_score": 8,
  "energy_level": 7,
  "notes": "Good session overall, need more time for legato"
}
```

## Benefits

1. **Flexibility**: Can store any session structure
2. **Templates**: Reusable session structures
3. **Tracking**: Track completion of individual exercises
4. **Analytics**: Rich data for analysis (duration, focus, energy)
5. **Extensibility**: Easy to add new fields without schema changes

## Migration Strategy

1. **Add columns** to existing tables (nullable)
2. **Keep old structure** working alongside new
3. **Gradually migrate** sessions to use JSON structure
4. **Eventually deprecate** old immediate goals approach

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Database Migration)
3. Implement backend changes (Phases 2-3)
4. Implement frontend changes (Phases 4-6)
5. Test thoroughly
6. Migrate existing data

---

**Estimated Effort**: 8-12 hours
**Complexity**: High (database schema change + new features)
**Risk**: Medium (requires careful migration)
**Reward**: Very High (much more powerful and flexible system)
