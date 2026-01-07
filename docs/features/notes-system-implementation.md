# Notes System Implementation Plan

**Created:** 2026-01-06  
**Status:** Planning  
**Priority:** High  

---

## Overview

Implement a comprehensive note-taking system that allows users to attach timestamped notes to any entity in the application (goals, sessions, activity instances, programs, calendar days). Notes should aggregate hierarchically, flowing upward from child entities to parent views. A reusable collapsible panel component will provide consistent note viewing/editing across all pages.

---

## Requirements

### Functional Requirements

1. **Note Attachment** - Users can attach text notes to:
   - Goals (all types: Ultimate through Nano)
   - Sessions
   - Activity Instances
   - Programs
   - Program Days (calendar days within programs)

2. **Hierarchical Aggregation** - When viewing notes for a parent entity, include notes from all descendant entities:
   - **Program** → shows notes from Program + Program Days + Sessions + Activity Instances
   - **Session** → shows notes from Session + Activity Instances
   - **Goal** → shows notes from Goal only (goals don't have child notes by default)

3. **Time-Series Querying** - All notes flow into a unified table enabling:
   - Chronological feed of all notes across a fractal
   - Date-range filtering
   - Entity-type filtering

4. **Previous Notes Access** - When performing an activity, users can:
   - View notes from all previous instances of that activity definition
   - Add new notes to the current instance
   - Access via a button in the activity card

5. **Reusable Collapsible Panel** - A sliding panel component that:
   - Can be triggered from any page/context
   - Shows notes for the target entity + descendants (grouped)
   - Supports adding new notes
   - Collapses/expands smoothly

6. **Rich Content Support** (Future phases):
   - Hyperlinks (markdown-style)
   - Image attachments

---

## Entity Hierarchy Reference

```
Program
  └── ProgramBlock
        └── ProgramDay
              └── Session (via program_day_id)
                    └── ActivityInstance (via session_id)

Fractal (Root Goal)
  └── Goal Hierarchy (7 levels)

Note: Sessions can exist independently OR linked to program days.
```

---

## Database Schema

### New Table: `notes`

```sql
CREATE TABLE notes (
    id              VARCHAR(36) PRIMARY KEY,
    
    -- Content
    content         TEXT NOT NULL,
    content_type    VARCHAR(20) DEFAULT 'text',  -- 'text', 'markdown' (future)
    
    -- Polymorphic entity reference
    entity_type     VARCHAR(50) NOT NULL,        -- 'goal', 'session', 'activity_instance', 'program', 'program_day'
    entity_id       VARCHAR(36) NOT NULL,
    
    -- Denormalized for efficient queries
    root_id         VARCHAR(36) NOT NULL,        -- FK to goals.id (fractal root)
    
    -- Optional: Denormalized parent references for fast aggregation
    -- (Populate on insert based on entity_type)
    session_id      VARCHAR(36),                 -- Set if entity is activity_instance
    program_day_id  VARCHAR(36),                 -- Set if session belongs to program day
    program_id      VARCHAR(36),                 -- Set if part of a program
    
    -- Timestamps
    created_at      DATETIME NOT NULL,
    updated_at      DATETIME,
    deleted_at      DATETIME,                    -- Soft delete
    
    -- Future: Rich content
    metadata        TEXT,                        -- JSON for images, links, etc.
    
    -- Constraints
    FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX idx_notes_entity ON notes (entity_type, entity_id);
CREATE INDEX idx_notes_root_created ON notes (root_id, created_at DESC);
CREATE INDEX idx_notes_session ON notes (session_id, created_at DESC);
CREATE INDEX idx_notes_program ON notes (program_id, created_at DESC);
CREATE INDEX idx_notes_program_day ON notes (program_day_id, created_at DESC);
```

### SQLAlchemy Model: `models.py`

```python
class Note(db.Model):
    __tablename__ = 'notes'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Content
    content = db.Column(db.Text, nullable=False)
    content_type = db.Column(db.String(20), default='text')
    
    # Polymorphic entity reference
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.String(36), nullable=False)
    
    # Denormalized references
    root_id = db.Column(db.String(36), db.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False)
    session_id = db.Column(db.String(36), db.ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True)
    program_day_id = db.Column(db.String(36), db.ForeignKey('program_days.id', ondelete='SET NULL'), nullable=True)
    program_id = db.Column(db.String(36), db.ForeignKey('programs.id', ondelete='SET NULL'), nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    deleted_at = db.Column(db.DateTime, nullable=True)
    
    # Future
    metadata = db.Column(db.Text, nullable=True)  # JSON
    
    def to_dict(self):
        return {
            'id': self.id,
            'content': self.content,
            'content_type': self.content_type,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'root_id': self.root_id,
            'session_id': self.session_id,
            'program_day_id': self.program_day_id,
            'program_id': self.program_id,
            'created_at': format_utc(self.created_at),
            'updated_at': format_utc(self.updated_at) if self.updated_at else None,
        }
```

---

## Backend API

### New Blueprint: `blueprints/notes_api.py`

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/<root_id>/notes` | Create a new note |
| `GET` | `/api/<root_id>/notes` | List notes (with filters) |
| `GET` | `/api/<root_id>/notes/<note_id>` | Get single note |
| `PUT` | `/api/<root_id>/notes/<note_id>` | Update note |
| `DELETE` | `/api/<root_id>/notes/<note_id>` | Soft-delete note |
| `GET` | `/api/<root_id>/notes/feed` | Time-series feed with pagination |
| `GET` | `/api/<root_id>/notes/for-activity/<activity_def_id>` | Previous notes for an activity definition |

#### Query Parameters for `GET /notes`

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_type` | string | Filter by entity type |
| `entity_id` | string | Filter by specific entity |
| `include_children` | boolean | Include notes from descendant entities (default: true) |
| `start_date` | ISO date | Filter notes after this date |
| `end_date` | ISO date | Filter notes before this date |
| `limit` | integer | Pagination limit (default: 50) |
| `offset` | integer | Pagination offset |

#### Create Note Request Body

```json
{
  "content": "This set felt really strong today!",
  "entity_type": "activity_instance",
  "entity_id": "ai-123-456"
}
```

#### Response with Entity Context

When fetching notes, include hydrated context for display:

```json
{
  "notes": [
    {
      "id": "note-abc",
      "content": "PR on this set!",
      "entity_type": "activity_instance",
      "entity_id": "ai-123",
      "created_at": "2026-01-06T21:35:00Z",
      "entity_context": {
        "activity_name": "Bench Press",
        "session_name": "Upper Body Day",
        "session_id": "sess-456",
        "session_date": "2026-01-06"
      }
    }
  ],
  "total": 15,
  "has_more": true
}
```

#### Hierarchical Query Logic

```python
def get_notes_for_entity(root_id, entity_type, entity_id, include_children=True):
    """
    Fetch notes for an entity, optionally including all descendant notes.
    """
    base_query = Note.query.filter(
        Note.root_id == root_id,
        Note.deleted_at.is_(None)
    )
    
    if entity_type == 'session' and include_children:
        # Get session notes + activity instance notes
        return base_query.filter(
            db.or_(
                db.and_(Note.entity_type == 'session', Note.entity_id == entity_id),
                Note.session_id == entity_id
            )
        ).order_by(Note.created_at.desc()).all()
    
    elif entity_type == 'program' and include_children:
        # Get all notes within this program
        return base_query.filter(
            Note.program_id == entity_id
        ).order_by(Note.created_at.desc()).all()
    
    elif entity_type == 'program_day' and include_children:
        # Get program day notes + session notes + activity notes
        return base_query.filter(
            Note.program_day_id == entity_id
        ).order_by(Note.created_at.desc()).all()
    
    else:
        # Direct entity match only
        return base_query.filter(
            Note.entity_type == entity_type,
            Note.entity_id == entity_id
        ).order_by(Note.created_at.desc()).all()
```

#### Populating Denormalized Fields on Create

```python
def create_note(root_id, data):
    """
    Create a note and populate denormalized parent references.
    """
    entity_type = data['entity_type']
    entity_id = data['entity_id']
    
    note = Note(
        content=data['content'],
        entity_type=entity_type,
        entity_id=entity_id,
        root_id=root_id
    )
    
    # Populate denormalized fields based on entity type
    if entity_type == 'activity_instance':
        instance = ActivityInstance.query.get(entity_id)
        if instance:
            note.session_id = instance.session_id
            session = Session.query.get(instance.session_id)
            if session and session.program_day_id:
                note.program_day_id = session.program_day_id
                program_day = ProgramDay.query.get(session.program_day_id)
                if program_day:
                    block = ProgramBlock.query.get(program_day.block_id)
                    if block:
                        note.program_id = block.program_id
    
    elif entity_type == 'session':
        session = Session.query.get(entity_id)
        if session:
            note.session_id = entity_id
            if session.program_day_id:
                note.program_day_id = session.program_day_id
                program_day = ProgramDay.query.get(session.program_day_id)
                if program_day:
                    block = ProgramBlock.query.get(program_day.block_id)
                    if block:
                        note.program_id = block.program_id
    
    elif entity_type == 'program_day':
        program_day = ProgramDay.query.get(entity_id)
        if program_day:
            note.program_day_id = entity_id
            block = ProgramBlock.query.get(program_day.block_id)
            if block:
                note.program_id = block.program_id
    
    elif entity_type == 'program':
        note.program_id = entity_id
    
    db.session.add(note)
    db.session.commit()
    return note
```

---

## Frontend Components

### Component Architecture

```
/client/src/components/notes/
├── NotesPanel.jsx          # Main collapsible panel (the reusable modal)
├── NotesPanel.css          # Panel styling
├── NoteEditor.jsx          # Text input for creating/editing notes
├── NoteCard.jsx            # Single note display
├── NotesList.jsx           # Grouped list of notes
├── NotesButton.jsx         # Trigger button with badge
├── PreviousNotesPanel.jsx  # Specialized panel for activity history
└── index.js                # Barrel export
```

### NotesPanel.jsx (Main Reusable Component)

The collapsible panel that can be used on any page:

```jsx
/**
 * NotesPanel - Reusable collapsible panel for viewing/adding notes
 * 
 * Props:
 * - isOpen: boolean - Controls panel visibility
 * - onClose: function - Called when panel should close
 * - entityType: string - 'goal' | 'session' | 'activity_instance' | 'program' | 'program_day'
 * - entityId: string - ID of the entity
 * - entityName: string - Display name for the header
 * - rootId: string - Fractal root ID
 * - includeChildren: boolean - Whether to include descendant notes (default: true)
 * - position: 'right' | 'bottom' - Panel slide direction (default: 'right')
 */

import { useState, useEffect } from 'react';
import { fractalApi } from '../../utils/api';
import NoteEditor from './NoteEditor';
import NotesList from './NotesList';
import './NotesPanel.css';

const NotesPanel = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  rootId,
  includeChildren = true,
  position = 'right'
}) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && entityId) {
      fetchNotes();
    }
  }, [isOpen, entityId, entityType]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const response = await fractalApi.getNotes(rootId, {
        entity_type: entityType,
        entity_id: entityId,
        include_children: includeChildren
      });
      setNotes(response.notes);
    } catch (err) {
      setError('Failed to load notes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (content) => {
    try {
      const newNote = await fractalApi.createNote(rootId, {
        content,
        entity_type: entityType,
        entity_id: entityId
      });
      setNotes([newNote, ...notes]);
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await fractalApi.deleteNote(rootId, noteId);
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Group notes by entity for hierarchical display
  const groupedNotes = groupNotesByEntity(notes, entityType);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`notes-panel-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className={`notes-panel ${position} ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="notes-panel-header">
          <div className="notes-panel-title">
            <span className="notes-icon">📝</span>
            <h3>Notes: {entityName}</h3>
          </div>
          <button className="notes-panel-close" onClick={onClose}>×</button>
        </div>

        {/* Add Note Section */}
        <div className="notes-panel-add">
          <NoteEditor 
            onSubmit={handleAddNote}
            placeholder={`Add a note to ${entityName}...`}
          />
        </div>

        {/* Notes List */}
        <div className="notes-panel-content">
          {loading ? (
            <div className="notes-loading">Loading notes...</div>
          ) : error ? (
            <div className="notes-error">{error}</div>
          ) : notes.length === 0 ? (
            <div className="notes-empty">
              <p>No notes yet</p>
              <span>Add your first note above</span>
            </div>
          ) : (
            <NotesList 
              groupedNotes={groupedNotes}
              entityType={entityType}
              onDelete={handleDeleteNote}
            />
          )}
        </div>
      </div>
    </>
  );
};

// Helper: Group notes by their source entity
function groupNotesByEntity(notes, parentEntityType) {
  const groups = {
    direct: [],      // Notes on the parent entity itself
    children: {}     // Notes on child entities, grouped by activity/child name
  };

  notes.forEach(note => {
    if (note.entity_type === parentEntityType && note.entity_id === note.entity_id) {
      groups.direct.push(note);
    } else {
      const groupKey = note.entity_context?.activity_name || 
                       note.entity_context?.session_name || 
                       note.entity_type;
      if (!groups.children[groupKey]) {
        groups.children[groupKey] = [];
      }
      groups.children[groupKey].push(note);
    }
  });

  return groups;
}

export default NotesPanel;
```

### NotesPanel.css

```css
/* Backdrop */
.notes-panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
  z-index: 999;
}

.notes-panel-backdrop.open {
  opacity: 1;
  visibility: visible;
}

/* Panel - Right Position */
.notes-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  max-width: 90vw;
  height: 100vh;
  background: var(--bg-secondary, #1a1a2e);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.notes-panel.open {
  transform: translateX(0);
}

/* Panel - Bottom Position */
.notes-panel.bottom {
  top: auto;
  bottom: 0;
  right: 0;
  left: 0;
  width: 100%;
  max-width: 100%;
  height: 50vh;
  transform: translateY(100%);
  border-radius: 16px 16px 0 0;
}

.notes-panel.bottom.open {
  transform: translateY(0);
}

/* Header */
.notes-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #2a2a4a);
  background: var(--bg-tertiary, #16162a);
}

.notes-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notes-panel-title h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary, #fff);
}

.notes-icon {
  font-size: 1.3rem;
}

.notes-panel-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s, color 0.2s;
}

.notes-panel-close:hover {
  background: var(--bg-hover, #2a2a4a);
  color: var(--text-primary, #fff);
}

/* Add Note Section */
.notes-panel-add {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #2a2a4a);
}

/* Content Area */
.notes-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* States */
.notes-loading,
.notes-error,
.notes-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary, #888);
}

.notes-empty p {
  margin: 0 0 8px 0;
  font-size: 1rem;
}

.notes-empty span {
  font-size: 0.85rem;
  opacity: 0.7;
}

.notes-error {
  color: var(--error-color, #ff6b6b);
}
```

### NoteEditor.jsx

```jsx
import { useState } from 'react';

const NoteEditor = ({ onSubmit, placeholder = 'Add a note...', initialValue = '' }) => {
  const [content, setContent] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    
    setSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <form className="note-editor" onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={submitting}
      />
      <div className="note-editor-footer">
        <span className="note-editor-hint">⌘ + Enter to submit</span>
        <button 
          type="submit" 
          disabled={!content.trim() || submitting}
        >
          {submitting ? 'Adding...' : 'Add Note'}
        </button>
      </div>
    </form>
  );
};

export default NoteEditor;
```

### NoteCard.jsx

```jsx
import { formatDistanceToNow } from 'date-fns';

const NoteCard = ({ note, onDelete, showContext = false }) => {
  const timeAgo = formatDistanceToNow(new Date(note.created_at), { addSuffix: true });

  return (
    <div className="note-card">
      <div className="note-card-header">
        <span className="note-card-time">{timeAgo}</span>
        {showContext && note.entity_context && (
          <span className="note-card-context">
            {note.entity_context.activity_name || note.entity_context.session_name}
          </span>
        )}
        <button 
          className="note-card-delete"
          onClick={() => onDelete(note.id)}
          title="Delete note"
        >
          🗑️
        </button>
      </div>
      <div className="note-card-content">
        {note.content}
      </div>
    </div>
  );
};

export default NoteCard;
```

### NotesList.jsx

```jsx
import NoteCard from './NoteCard';

const NotesList = ({ groupedNotes, entityType, onDelete }) => {
  const { direct, children } = groupedNotes;
  const childGroupKeys = Object.keys(children);

  return (
    <div className="notes-list">
      {/* Direct notes on the entity */}
      {direct.length > 0 && (
        <div className="notes-group">
          <div className="notes-group-header">
            <span className="notes-group-title">
              {getEntityLabel(entityType)} Notes ({direct.length})
            </span>
          </div>
          <div className="notes-group-items">
            {direct.map(note => (
              <NoteCard key={note.id} note={note} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Child entity notes (collapsible groups) */}
      {childGroupKeys.length > 0 && (
        <div className="notes-children-section">
          <div className="notes-section-divider">
            <span>Activity Notes</span>
          </div>
          
          {childGroupKeys.map(groupKey => (
            <CollapsibleGroup 
              key={groupKey}
              title={groupKey}
              notes={children[groupKey]}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CollapsibleGroup = ({ title, notes, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="notes-collapsible-group">
      <button 
        className="notes-collapsible-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="notes-collapsible-icon">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="notes-collapsible-title">{title}</span>
        <span className="notes-collapsible-count">({notes.length})</span>
      </button>
      
      {isExpanded && (
        <div className="notes-collapsible-content">
          {notes.map(note => (
            <NoteCard key={note.id} note={note} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
};

function getEntityLabel(entityType) {
  const labels = {
    goal: 'Goal',
    session: 'Session',
    activity_instance: 'Activity',
    program: 'Program',
    program_day: 'Day'
  };
  return labels[entityType] || 'Entity';
}

export default NotesList;
```

### NotesButton.jsx (Trigger Component)

```jsx
/**
 * NotesButton - Trigger button for opening the notes panel
 * Shows a badge with note count
 */

const NotesButton = ({ 
  noteCount = 0, 
  onClick, 
  size = 'medium',
  label = 'Notes' 
}) => {
  return (
    <button 
      className={`notes-button notes-button-${size}`}
      onClick={onClick}
      title={`View notes (${noteCount})`}
    >
      <span className="notes-button-icon">📝</span>
      {size !== 'small' && <span className="notes-button-label">{label}</span>}
      {noteCount > 0 && (
        <span className="notes-button-badge">{noteCount}</span>
      )}
    </button>
  );
};

export default NotesButton;
```

---

## Integration Points

### 1. SessionDetail.jsx

Add notes button to session header and activity cards:

```jsx
import { NotesButton, NotesPanel } from '../components/notes';

const SessionDetail = () => {
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [notesPanelConfig, setNotesPanelConfig] = useState(null);

  const openSessionNotes = () => {
    setNotesPanelConfig({
      entityType: 'session',
      entityId: sessionId,
      entityName: session.name,
      includeChildren: true
    });
    setNotesPanelOpen(true);
  };

  const openActivityNotes = (instance) => {
    setNotesPanelConfig({
      entityType: 'activity_instance',
      entityId: instance.id,
      entityName: instance.activity_definition.name,
      includeChildren: false
    });
    setNotesPanelOpen(true);
  };

  return (
    <>
      {/* In session header */}
      <NotesButton onClick={openSessionNotes} noteCount={sessionNoteCount} />

      {/* In each activity card */}
      {activities.map(instance => (
        <SessionActivityItem
          key={instance.id}
          instance={instance}
          onNotesClick={() => openActivityNotes(instance)}
        />
      ))}

      {/* Notes Panel */}
      <NotesPanel
        isOpen={notesPanelOpen}
        onClose={() => setNotesPanelOpen(false)}
        rootId={rootId}
        {...notesPanelConfig}
      />
    </>
  );
};
```

### 2. GoalDetailModal.jsx

Add notes section to goal details:

```jsx
// In GoalDetailModal
<NotesButton 
  onClick={() => setShowNotesPanel(true)} 
  noteCount={goalNoteCount}
  label="Goal Notes"
/>
```

### 3. ProgramDetail.jsx

Add notes to program and day views:

```jsx
// Program-level notes
<NotesButton 
  onClick={() => openProgramNotes()} 
  noteCount={programNoteCount}
/>

// In DayViewModal
<NotesButton 
  onClick={() => openDayNotes(programDay)} 
  noteCount={dayNoteCount}
/>
```

### 4. SessionActivityItem.jsx (Previous Notes Feature)

Special handling for viewing notes from previous instances of the same activity:

```jsx
const SessionActivityItem = ({ instance, rootId }) => {
  const [showPreviousNotes, setShowPreviousNotes] = useState(false);

  return (
    <div className="activity-item">
      {/* ... existing content ... */}
      
      <button 
        className="activity-notes-history"
        onClick={() => setShowPreviousNotes(true)}
        title="View notes from previous sessions"
      >
        📜 History
      </button>

      {/* Previous Notes Panel */}
      <PreviousNotesPanel
        isOpen={showPreviousNotes}
        onClose={() => setShowPreviousNotes(false)}
        activityDefinitionId={instance.activity_definition_id}
        currentInstanceId={instance.id}
        rootId={rootId}
      />
    </div>
  );
};
```

---

## API Client Updates

### `utils/api.js`

```javascript
// Notes API
getNotes: async (rootId, params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  const response = await api.get(`/${rootId}/notes?${queryString}`);
  return response.data;
},

createNote: async (rootId, data) => {
  const response = await api.post(`/${rootId}/notes`, data);
  return response.data;
},

updateNote: async (rootId, noteId, data) => {
  const response = await api.put(`/${rootId}/notes/${noteId}`, data);
  return response.data;
},

deleteNote: async (rootId, noteId) => {
  const response = await api.delete(`/${rootId}/notes/${noteId}`);
  return response.data;
},

getNotesForActivity: async (rootId, activityDefId) => {
  const response = await api.get(`/${rootId}/notes/for-activity/${activityDefId}`);
  return response.data;
},

getNotesFeed: async (rootId, params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  const response = await api.get(`/${rootId}/notes/feed?${queryString}`);
  return response.data;
},
```

---

## Implementation Phases

### Phase 1: Foundation (Est. 3-4 hours)
- [ ] Create `notes` table migration script
- [ ] Add `Note` model to `models.py`
- [ ] Create `blueprints/notes_api.py` with CRUD endpoints
- [ ] Add API client functions to `utils/api.js`
- [ ] Write unit tests for Note model

### Phase 2: Core UI Components (Est. 4-5 hours)
- [ ] Create `/components/notes/` directory structure
- [ ] Implement `NotesPanel.jsx` with collapsible behavior
- [ ] Implement `NoteEditor.jsx`
- [ ] Implement `NoteCard.jsx`
- [ ] Implement `NotesList.jsx` with grouping
- [ ] Implement `NotesButton.jsx`
- [ ] Add CSS styling with dark theme support

### Phase 3: Session Integration (Est. 2-3 hours)
- [ ] Add notes button to `SessionDetail.jsx` header
- [ ] Add notes button to `SessionActivityItem.jsx`
- [ ] Integrate `NotesPanel` into session pages
- [ ] Test session + activity instance note aggregation

### Phase 4: Goal Integration (Est. 2 hours)
- [ ] Add notes button to `GoalDetailModal.jsx`
- [ ] Handle goal notes (no children)
- [ ] Test goal notes display

### Phase 5: Program Integration (Est. 2-3 hours)
- [ ] Add notes to `ProgramDetail.jsx` header
- [ ] Add notes to `DayViewModal.jsx`
- [ ] Test program → day → session → activity aggregation

### Phase 6: Previous Notes Feature (Est. 2-3 hours)
- [ ] Create `PreviousNotesPanel.jsx` component
- [ ] Add "History" button to `SessionActivityItem.jsx`
- [ ] Implement `GET /notes/for-activity/:id` endpoint
- [ ] Test previous notes display across sessions

### Phase 7: Polish & Future (Est. 2-3 hours)
- [ ] Add keyboard shortcuts (Escape to close)
- [ ] Add mobile-responsive styles (bottom panel)
- [ ] Add optional markdown rendering
- [ ] Update `index.md` documentation

---

## Future Enhancements

1. **Rich Text Editor** - Replace textarea with markdown editor (e.g., `react-markdown`)
2. **Image Uploads** - Add drag-and-drop image support with local storage
3. **Search** - Full-text search across all notes
4. **Tags** - Add hashtag support for categorization
5. **Export** - Export notes as markdown/PDF
6. **Sync** - Real-time sync if multiple tabs are open

---

## Testing Checklist

- [ ] Create note on session
- [ ] Create note on activity instance
- [ ] View session notes (should include activity notes)
- [ ] Create note on goal
- [ ] Create note on program day
- [ ] View program notes (should include all descendant notes)
- [ ] Delete note
- [ ] Edit note
- [ ] View previous notes for an activity definition
- [ ] Panel opens/closes smoothly
- [ ] Notes persist after page refresh
- [ ] Mobile responsive behavior

---

## Open Questions

1. **Note Editing** - Should notes be editable after creation, or immutable (journal-style)?
2. **Timestamps** - Show relative time ("5 min ago") or absolute ("9:35 PM")?
3. **Notifications** - Any need for note reminders or highlighting?
4. **Permissions** - For future multi-user support, who can see/edit notes?
