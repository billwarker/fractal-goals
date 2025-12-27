# Practice Session JSON Structure Examples

## Overview
The `session_data` column stores flexible JSON structures that follow templates created with the "Create Session Template" button.

## JSON Structure

### Complete Session Data Example
```json
{
  "template_id": "550e8400-e29b-41d4-a716-446655440000",
  "template_name": "Morning Guitar Practice",
  "sections": [
    {
      "name": "Warm-up",
      "duration_minutes": 10,
      "actual_duration_minutes": 12,
      "exercises": [
        {
          "name": "Chromatic Scales",
          "description": "Up and down the neck, all strings",
          "completed": true,
          "notes": "Felt good today, increased tempo"
        },
        {
          "name": "Finger Stretches",
          "description": "Spider exercises",
          "completed": true,
          "notes": ""
        }
      ]
    },
    {
      "name": "Technique Practice",
      "duration_minutes": 20,
      "actual_duration_minutes": 18,
      "exercises": [
        {
          "name": "Alternate Picking",
          "description": "Metronome at 120 BPM",
          "completed": true,
          "notes": "Struggled with string changes"
        },
        {
          "name": "Legato Runs",
          "description": "Hammer-ons and pull-offs",
          "completed": false,
          "notes": "Ran out of time"
        }
      ]
    },
    {
      "name": "Repertoire",
      "duration_minutes": 30,
      "actual_duration_minutes": 30,
      "exercises": [
        {
          "name": "Song: Stairway to Heaven",
          "description": "Solo section",
          "completed": true,
          "notes": "Getting smoother!"
        }
      ]
    }
  ],
  "total_duration_minutes": 60,
  "actual_duration_minutes": 60,
  "focus_score": 8,
  "energy_level": 7,
  "notes": "Great session overall. Need to work more on legato technique."
}
```

### Minimal Session Data Example
```json
{
  "sections": [
    {
      "name": "Practice",
      "duration_minutes": 30,
      "exercises": [
        {
          "name": "General practice",
          "completed": true
        }
      ]
    }
  ],
  "total_duration_minutes": 30
}
```

### Template-Based Session (Before Completion)
```json
{
  "template_id": "550e8400-e29b-41d4-a716-446655440000",
  "template_name": "Morning Guitar Practice",
  "sections": [
    {
      "name": "Warm-up",
      "duration_minutes": 10,
      "exercises": [
        {
          "name": "Chromatic Scales",
          "description": "Up and down the neck",
          "completed": false,
          "notes": ""
        }
      ]
    }
  ],
  "total_duration_minutes": 60
}
```

## Field Descriptions

### Root Level
- `template_id` (optional): UUID of the template used
- `template_name` (optional): Name of the template for display
- `sections` (required): Array of practice sections
- `total_duration_minutes` (optional): Planned total duration
- `actual_duration_minutes` (optional): Actual time spent
- `focus_score` (optional): 1-10 rating of focus
- `energy_level` (optional): 1-10 rating of energy
- `notes` (optional): Overall session notes

### Section Object
- `name` (required): Section name (e.g., "Warm-up", "Technique")
- `duration_minutes` (optional): Planned duration for this section
- `actual_duration_minutes` (optional): Actual time spent
- `exercises` (required): Array of exercises in this section

### Exercise Object
- `name` (required): Exercise name
- `description` (optional): Exercise details/instructions
- `completed` (optional): Boolean, whether exercise was completed
- `notes` (optional): Notes about this specific exercise

## Database Storage

### PracticeSession Table
```
id                  VARCHAR (UUID)
name                VARCHAR          "Morning Practice"
description         VARCHAR          "Daily guitar routine"
completed           BOOLEAN          false
created_at          DATETIME         "2025-12-23T10:30:00"
root_id             VARCHAR          (fractal UUID)
duration_minutes    INTEGER          60
session_data        TEXT             (JSON string as shown above)
```

### Relationship to Templates
- Templates are stored in `session_templates` table
- When creating a session, user selects a template
- Template data is copied into `session_data`
- User can modify the session data before/during practice
- `template_id` in session_data links back to original template

## Usage Flow

1. **Create Template** (via "Create Session Template" button)
   - Define sections and exercises
   - Save to `session_templates` table

2. **Start Practice Session** (via "Log" page)
   - Select a template (or start blank)
   - Template data copied to new session's `session_data`
   - Set `duration_minutes` field

3. **During Practice**
   - Mark exercises as completed
   - Add notes to exercises
   - Track actual duration

4. **Complete Session**
   - Set `completed = true`
   - `actual_duration_minutes` stored in `session_data`
   - Overall `duration_minutes` field updated

## Benefits

✅ **Flexible**: Can add new fields without schema changes
✅ **Template-based**: Reuse common practice structures
✅ **Detailed**: Track individual exercises and notes
✅ **Comparable**: Compare planned vs actual duration
✅ **Extensible**: Easy to add focus_score, energy_level, etc.
