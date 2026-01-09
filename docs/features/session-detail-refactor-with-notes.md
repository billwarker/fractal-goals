# SessionDetail Refactor + Notes Implementation Plan

**Date:** 2026-01-09  
**Status:** Implementation Plan  
**Goals:**
1. Refactor `SessionDetail.jsx` (1,415 lines → ~300 lines orchestrator)
2. Add Notes feature with persistent SidePane
3. Add Activity History mode to SidePane

---

## Executive Summary

We will decompose the `SessionDetail.jsx` god component while simultaneously adding a new **Session SidePane** that provides:
- **Notes Mode** (default): Quick-add notes, timeline of notes, previous session notes
- **History Mode**: View previous activity instance metrics when focused on an activity

---

## Current State Analysis

### SessionDetail.jsx Breakdown (1,415 lines)

| Lines | Responsibility | Extract To |
|-------|---------------|------------|
| 1-75 | Imports, helper functions | Keep / Move to utils |
| 79-186 | Component setup, state, effects | Keep minimal |
| 188-267 | Data fetching (session, activities, instances) | `hooks/useSessionData.js` |
| 269-335 | Instance creation, initialization | `hooks/useActivityInstances.js` |
| 337-512 | Exercise change handlers (timer, metrics, notes) | `hooks/useActivityHandlers.js` |
| 514-619 | Session completion, save, delete | `hooks/useSessionActions.js` |
| 621-744 | Activity builder, add activity, reorder, goals | Various handlers |
| 746-764 | Loading/error states | Keep |
| 766-1412 | JSX rendering | Extract to sub-components |

---

## New Architecture

### Component Tree

```
SessionDetail.jsx (~300 lines - Orchestrator)
├── SessionHeader.jsx (~100 lines)
│   ├── Title, template info, program link
│   ├── Associated goals display
│   └── Auto-save status indicator
│
├── SessionMetadata.jsx (~80 lines)
│   ├── Start/end time inputs
│   ├── Duration display
│   └── Completion toggle button
│
├── SessionContent.jsx (~150 lines)
│   ├── Section containers loop
│   └── Activity selector per section
│       └── SectionContainer.jsx (~100 lines)
│           ├── Section header with duration
│           └── ActivityList.jsx
│               └── SessionActivityItem.jsx (existing, minimal changes)
│
├── SessionActions.jsx (~50 lines)
│   ├── Save button
│   ├── Delete button (with confirmation)
│   └── Mark Complete button
│
└── SessionSidePane.jsx (~250 lines) *** NEW ***
    ├── SidePaneHeader.jsx
    │   ├── Mode toggle (Notes | History)
    │   └── Context indicator
    │
    ├── NotesPanel.jsx (~200 lines) *** NEW ***
    │   ├── NoteQuickAdd.jsx (~60 lines)
    │   ├── NoteTimeline.jsx (~100 lines)
    │   │   └── NoteItem.jsx (~40 lines)
    │   └── PreviousNotesSection.jsx (~80 lines)
    │
    └── HistoryPanel.jsx (~150 lines) *** NEW ***
        ├── Activity selector
        └── Previous instances table/cards
```

### Custom Hooks

```
hooks/
├── useSessionData.js         # Fetch session, activities, instances
├── useActivityInstances.js   # CRUD for activity instances
├── useActivityHandlers.js    # Timer, metrics, notes updates
├── useSessionActions.js      # Complete, save, delete session
├── useAutoSave.js            # Debounced auto-save logic
├── useSessionNotes.js        # Notes CRUD for session *** NEW ***
└── useSidePaneContext.js     # Track selected activity for side pane *** NEW ***
```

---

## Backend Implementation

### New `notes` Table

```python
# models.py - Add this class

class Note(Base):
    """
    Timestamped notes that can be attached to various entities.
    
    context_type determines what the note is attached to:
    - 'session': General session-level note
    - 'activity_instance': Note for a specific activity occurrence
    - 'set': Note for a specific set within an activity
    """
    __tablename__ = 'notes'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Polymorphic context
    context_type = Column(String, nullable=False)  # 'session', 'activity_instance', 'set'
    context_id = Column(String, nullable=False, index=True)
    
    # Denormalized for efficient queries
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    
    # For set-level notes
    set_index = Column(Integer, nullable=True)
    
    # Content
    content = Column(Text, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    session = relationship("Session", backref="notes")
    activity_instance = relationship("ActivityInstance", backref="notes")
    
    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
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

### New `notes_api.py` Blueprint

```python
# blueprints/notes_api.py

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)
from models import get_session, Note, Session, ActivityInstance

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


@notes_bp.route('/<root_id>/sessions/<session_id>/notes', methods=['GET'])
def get_session_notes(root_id, session_id):
    """Get all notes for a session (includes activity instance notes)."""
    db = get_session(get_engine())
    try:
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id == session_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([n.to_dict() for n in notes])
    finally:
        db.close()


@notes_bp.route('/<root_id>/activity-instances/<instance_id>/notes', methods=['GET'])
def get_activity_instance_notes(root_id, instance_id):
    """Get notes for a specific activity instance."""
    db = get_session(get_engine())
    try:
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).all()
        
        return jsonify([n.to_dict() for n in notes])
    finally:
        db.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/notes', methods=['GET'])
def get_activity_definition_notes(root_id, activity_id):
    """Get recent notes for an activity definition (across all sessions)."""
    db = get_session(get_engine())
    try:
        limit = request.args.get('limit', 20, type=int)
        
        notes = db.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_definition_id == activity_id,
            Note.deleted_at == None
        ).order_by(Note.created_at.desc()).limit(limit).all()
        
        return jsonify([n.to_dict() for n in notes])
    finally:
        db.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/history', methods=['GET'])
def get_activity_history(root_id, activity_id):
    """Get previous instances of an activity with their metrics."""
    db = get_session(get_engine())
    try:
        limit = request.args.get('limit', 10, type=int)
        exclude_session_id = request.args.get('exclude_session', None)
        
        query = db.query(ActivityInstance).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.deleted_at == None
        )
        
        if exclude_session_id:
            query = query.filter(ActivityInstance.session_id != exclude_session_id)
        
        instances = query.order_by(ActivityInstance.created_at.desc()).limit(limit).all()
        
        # Include session info for context
        results = []
        for inst in instances:
            data = inst.to_dict()
            if inst.session:
                data['session_name'] = inst.session.name
                data['session_date'] = format_utc(inst.session.session_start or inst.session.created_at)
            results.append(data)
        
        return jsonify(results)
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes', methods=['POST'])
def create_note(root_id):
    """Create a new note."""
    db = get_session(get_engine())
    try:
        data = request.get_json()
        
        note = Note(
            id=str(uuid.uuid4()),
            root_id=root_id,
            context_type=data.get('context_type', 'session'),
            context_id=data.get('context_id'),
            session_id=data.get('session_id'),
            activity_instance_id=data.get('activity_instance_id'),
            activity_definition_id=data.get('activity_definition_id'),
            set_index=data.get('set_index'),
            content=data.get('content', '').strip()
        )
        
        if not note.content:
            return jsonify({"error": "Note content is required"}), 400
        
        db.add(note)
        db.commit()
        
        return jsonify(note.to_dict()), 201
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
def update_note(root_id, note_id):
    """Update a note."""
    db = get_session(get_engine())
    try:
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at == None
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        data = request.get_json()
        if 'content' in data:
            note.content = data['content'].strip()
            if not note.content:
                return jsonify({"error": "Note content cannot be empty"}), 400
        
        db.commit()
        return jsonify(note.to_dict())
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['DELETE'])
def delete_note(root_id, note_id):
    """Soft delete a note."""
    db = get_session(get_engine())
    try:
        note = db.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at == None
        ).first()
        
        if not note:
            return jsonify({"error": "Note not found"}), 404
        
        note.deleted_at = datetime.now(timezone.utc)
        db.commit()
        
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting note: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()
```

### Database Migration Script

```python
# python-scripts/migrate_add_notes_table.py

"""
Migration: Add notes table for timestamped note-taking.

Run: python python-scripts/migrate_add_notes_table.py
"""

import sqlite3
import os
from datetime import datetime

# Get database path
DB_PATH = os.environ.get('DATABASE_PATH', 'goals.db')

def migrate():
    print(f"Migrating database: {DB_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if table already exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'")
    if cursor.fetchone():
        print("Notes table already exists, skipping migration.")
        conn.close()
        return
    
    print("Creating notes table...")
    cursor.execute('''
        CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            root_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            context_type TEXT NOT NULL,
            context_id TEXT NOT NULL,
            session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
            activity_instance_id TEXT REFERENCES activity_instances(id) ON DELETE SET NULL,
            activity_definition_id TEXT REFERENCES activity_definitions(id) ON DELETE SET NULL,
            set_index INTEGER,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )
    ''')
    
    # Create indexes
    print("Creating indexes...")
    cursor.execute('CREATE INDEX idx_notes_root ON notes(root_id)')
    cursor.execute('CREATE INDEX idx_notes_context ON notes(context_type, context_id)')
    cursor.execute('CREATE INDEX idx_notes_session ON notes(session_id)')
    cursor.execute('CREATE INDEX idx_notes_activity_instance ON notes(activity_instance_id)')
    cursor.execute('CREATE INDEX idx_notes_activity_def ON notes(activity_definition_id)')
    cursor.execute('CREATE INDEX idx_notes_created ON notes(created_at DESC)')
    
    conn.commit()
    print("✅ Migration complete!")
    
    conn.close()

if __name__ == '__main__':
    migrate()
```

---

## Frontend Implementation

### New Directory Structure

```
client/src/
├── pages/
│   └── SessionDetail.jsx         # Refactored orchestrator (~300 lines)
│
├── components/
│   └── sessionDetail/            # NEW directory
│       ├── index.js              # Barrel export
│       ├── SessionHeader.jsx
│       ├── SessionMetadata.jsx
│       ├── SessionContent.jsx
│       ├── SectionContainer.jsx
│       ├── SessionActions.jsx
│       ├── SessionSidePane.jsx   # Side pane container
│       ├── NotesPanel.jsx        # Notes mode
│       ├── NoteQuickAdd.jsx
│       ├── NoteTimeline.jsx
│       ├── NoteItem.jsx
│       ├── PreviousNotesSection.jsx
│       ├── HistoryPanel.jsx      # History mode
│       └── ActivityHistoryCard.jsx
│
├── hooks/
│   ├── useSessionData.js
│   ├── useActivityInstances.js
│   ├── useActivityHandlers.js
│   ├── useSessionActions.js
│   ├── useAutoSave.js
│   ├── useSessionNotes.js        # NEW
│   └── useActivityHistory.js     # NEW
│
└── utils/
    └── api.js                    # Add notes API functions
```

### Key Component Designs

#### SessionSidePane.jsx

```jsx
/**
 * SessionSidePane - Persistent side panel for session detail view
 * 
 * Modes:
 * - 'notes': Show notes timeline with quick-add (default)
 * - 'history': Show previous activity instance metrics
 */

import React, { useState } from 'react';
import NotesPanel from './NotesPanel';
import HistoryPanel from './HistoryPanel';

function SessionSidePane({ 
    rootId,
    sessionId,
    selectedActivity,      // Currently focused activity (for history mode)
    activityInstances,     // All activity instances in session
    activities,            // Activity definitions for lookup
    onNoteAdded            // Callback when note is added
}) {
    const [mode, setMode] = useState('notes');  // 'notes' | 'history'
    
    return (
        <div className="session-sidepane">
            {/* Mode Toggle */}
            <div className="sidepane-header">
                <div className="sidepane-tabs">
                    <button 
                        className={`tab ${mode === 'notes' ? 'active' : ''}`}
                        onClick={() => setMode('notes')}
                    >
                        📝 Notes
                    </button>
                    <button 
                        className={`tab ${mode === 'history' ? 'active' : ''}`}
                        onClick={() => setMode('history')}
                    >
                        📊 History
                    </button>
                </div>
                
                {mode === 'notes' && (
                    <div className="sidepane-context">
                        {selectedActivity ? (
                            <span>Notes for {selectedActivity.name}</span>
                        ) : (
                            <span>Session Notes</span>
                        )}
                    </div>
                )}
                
                {mode === 'history' && selectedActivity && (
                    <div className="sidepane-context">
                        History: {selectedActivity.name}
                    </div>
                )}
            </div>
            
            {/* Mode Content */}
            <div className="sidepane-content">
                {mode === 'notes' ? (
                    <NotesPanel
                        rootId={rootId}
                        sessionId={sessionId}
                        selectedActivity={selectedActivity}
                        onNoteAdded={onNoteAdded}
                    />
                ) : (
                    <HistoryPanel
                        rootId={rootId}
                        sessionId={sessionId}
                        selectedActivity={selectedActivity}
                        activities={activities}
                    />
                )}
            </div>
        </div>
    );
}

export default SessionSidePane;
```

#### NotesPanel.jsx

```jsx
/**
 * NotesPanel - Notes mode for SessionSidePane
 * 
 * Features:
 * - Quick-add input at top
 * - Timeline of notes for current session
 * - Previous session notes section
 */

import React from 'react';
import { useSessionNotes } from '../../hooks/useSessionNotes';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import PreviousNotesSection from './PreviousNotesSection';

function NotesPanel({ rootId, sessionId, selectedActivity, onNoteAdded }) {
    const { 
        notes, 
        loading, 
        addNote, 
        updateNote, 
        deleteNote,
        previousNotes 
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);
    
    const handleAddNote = async (content, setIndex = null) => {
        await addNote({
            context_type: selectedActivity ? 'activity_instance' : 'session',
            context_id: selectedActivity?.id || sessionId,
            session_id: sessionId,
            activity_instance_id: selectedActivity?.id,
            activity_definition_id: selectedActivity?.activity_definition_id,
            set_index: setIndex,
            content
        });
        onNoteAdded?.();
    };
    
    // Filter notes based on selected activity
    const displayNotes = selectedActivity
        ? notes.filter(n => n.activity_instance_id === selectedActivity.id)
        : notes.filter(n => n.context_type === 'session');
    
    return (
        <div className="notes-panel">
            {/* Quick Add */}
            <NoteQuickAdd onSubmit={handleAddNote} />
            
            {/* Current Session Notes */}
            <div className="notes-section">
                <h4>This Session</h4>
                {loading ? (
                    <div className="loading">Loading notes...</div>
                ) : displayNotes.length > 0 ? (
                    <NoteTimeline 
                        notes={displayNotes}
                        onUpdate={updateNote}
                        onDelete={deleteNote}
                    />
                ) : (
                    <div className="empty-state">No notes yet</div>
                )}
            </div>
            
            {/* Previous Session Notes (only when activity selected) */}
            {selectedActivity && previousNotes.length > 0 && (
                <PreviousNotesSection notes={previousNotes} />
            )}
        </div>
    );
}

export default NotesPanel;
```

#### NoteQuickAdd.jsx

```jsx
/**
 * NoteQuickAdd - Quick input for adding notes
 */

import React, { useState } from 'react';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note..." }) {
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim() || isSubmitting) return;
        
        setIsSubmitting(true);
        try {
            await onSubmit(content.trim());
            setContent('');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };
    
    return (
        <form className="note-quick-add" onSubmit={handleSubmit}>
            <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isSubmitting}
                className="note-input"
            />
            <button 
                type="submit" 
                disabled={!content.trim() || isSubmitting}
                className="note-submit-btn"
            >
                {isSubmitting ? '...' : '📝'}
            </button>
        </form>
    );
}

export default NoteQuickAdd;
```

#### HistoryPanel.jsx

```jsx
/**
 * HistoryPanel - Activity history mode for SessionSidePane
 * 
 * Shows previous instances of the selected activity with their metrics.
 */

import React, { useState } from 'react';
import { useActivityHistory } from '../../hooks/useActivityHistory';
import ActivityHistoryCard from './ActivityHistoryCard';

function HistoryPanel({ rootId, sessionId, selectedActivity, activities }) {
    const [selectedActivityId, setSelectedActivityId] = useState(
        selectedActivity?.activity_definition_id || null
    );
    
    const { history, loading } = useActivityHistory(
        rootId, 
        selectedActivityId, 
        sessionId  // Exclude current session
    );
    
    // Get unique activities from current session for selector
    const sessionActivities = [...new Map(
        activities.map(a => [a.id, a])
    ).values()];
    
    return (
        <div className="history-panel">
            {/* Activity Selector */}
            <div className="history-selector">
                <label>Select Activity:</label>
                <select 
                    value={selectedActivityId || ''}
                    onChange={(e) => setSelectedActivityId(e.target.value || null)}
                >
                    <option value="">-- Choose activity --</option>
                    {sessionActivities.map(activity => (
                        <option key={activity.id} value={activity.id}>
                            {activity.name}
                        </option>
                    ))}
                </select>
            </div>
            
            {/* History Content */}
            <div className="history-content">
                {!selectedActivityId ? (
                    <div className="empty-state">
                        Select an activity to view previous sessions
                    </div>
                ) : loading ? (
                    <div className="loading">Loading history...</div>
                ) : history.length > 0 ? (
                    <div className="history-list">
                        {history.map(instance => (
                            <ActivityHistoryCard 
                                key={instance.id} 
                                instance={instance} 
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        No previous sessions found for this activity
                    </div>
                )}
            </div>
        </div>
    );
}

export default HistoryPanel;
```

### Custom Hooks

#### useSessionNotes.js

```javascript
/**
 * useSessionNotes - Hook for managing session notes
 */

import { useState, useEffect, useCallback } from 'react';
import { fractalApi } from '../utils/api';

export function useSessionNotes(rootId, sessionId, activityDefinitionId = null) {
    const [notes, setNotes] = useState([]);
    const [previousNotes, setPreviousNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Fetch session notes
    useEffect(() => {
        if (!rootId || !sessionId) return;
        
        const fetchNotes = async () => {
            setLoading(true);
            try {
                const response = await fractalApi.getSessionNotes(rootId, sessionId);
                setNotes(response.data);
            } catch (err) {
                console.error('Failed to fetch notes:', err);
            } finally {
                setLoading(false);
            }
        };
        
        fetchNotes();
    }, [rootId, sessionId]);
    
    // Fetch previous notes for activity definition
    useEffect(() => {
        if (!rootId || !activityDefinitionId) {
            setPreviousNotes([]);
            return;
        }
        
        const fetchPreviousNotes = async () => {
            try {
                const response = await fractalApi.getActivityDefinitionNotes(
                    rootId, 
                    activityDefinitionId,
                    { limit: 10 }
                );
                // Filter out notes from current session
                const filtered = response.data.filter(n => n.session_id !== sessionId);
                setPreviousNotes(filtered);
            } catch (err) {
                console.error('Failed to fetch previous notes:', err);
            }
        };
        
        fetchPreviousNotes();
    }, [rootId, activityDefinitionId, sessionId]);
    
    const addNote = useCallback(async (noteData) => {
        try {
            const response = await fractalApi.createNote(rootId, noteData);
            setNotes(prev => [response.data, ...prev]);
            return response.data;
        } catch (err) {
            console.error('Failed to add note:', err);
            throw err;
        }
    }, [rootId]);
    
    const updateNote = useCallback(async (noteId, content) => {
        try {
            const response = await fractalApi.updateNote(rootId, noteId, { content });
            setNotes(prev => prev.map(n => n.id === noteId ? response.data : n));
            return response.data;
        } catch (err) {
            console.error('Failed to update note:', err);
            throw err;
        }
    }, [rootId]);
    
    const deleteNote = useCallback(async (noteId) => {
        try {
            await fractalApi.deleteNote(rootId, noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error('Failed to delete note:', err);
            throw err;
        }
    }, [rootId]);
    
    return {
        notes,
        previousNotes,
        loading,
        addNote,
        updateNote,
        deleteNote
    };
}
```

#### useAutoSave.js

```javascript
/**
 * useAutoSave - Reusable debounced auto-save hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export function useAutoSave(data, saveFn, options = {}) {
    const { delay = 1000, enabled = true } = options;
    const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const timeoutRef = useRef(null);
    const isFirstRender = useRef(true);
    
    useEffect(() => {
        // Skip first render to avoid saving on load
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        
        if (!enabled || !data) return;
        
        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        
        setStatus('saving');
        
        timeoutRef.current = setTimeout(async () => {
            try {
                await saveFn(data);
                setStatus('saved');
                setTimeout(() => setStatus('idle'), 2000);
            } catch (err) {
                console.error('Auto-save failed:', err);
                setStatus('error');
                setTimeout(() => setStatus('idle'), 3000);
            }
        }, delay);
        
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [data, saveFn, delay, enabled]);
    
    const reset = useCallback(() => {
        setStatus('idle');
    }, []);
    
    return { status, reset };
}
```

### API Client Updates

```javascript
// utils/api.js - Add these to fractalApi object

// ========== Notes ==========

// Get all notes for a session
getSessionNotes(rootId, sessionId) {
    return axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/notes`);
},

// Get notes for an activity instance
getActivityInstanceNotes(rootId, instanceId) {
    return axios.get(`${API_BASE}/${rootId}/activity-instances/${instanceId}/notes`);
},

// Get notes for an activity definition (across sessions)
getActivityDefinitionNotes(rootId, activityId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    return axios.get(`${API_BASE}/${rootId}/activities/${activityId}/notes?${params}`);
},

// Get activity history (previous instances)
getActivityHistory(rootId, activityId, excludeSessionId = null, options = {}) {
    const params = new URLSearchParams();
    if (excludeSessionId) params.append('exclude_session', excludeSessionId);
    if (options.limit) params.append('limit', options.limit);
    return axios.get(`${API_BASE}/${rootId}/activities/${activityId}/history?${params}`);
},

// Create a note
createNote(rootId, data) {
    return axios.post(`${API_BASE}/${rootId}/notes`, data);
},

// Update a note
updateNote(rootId, noteId, data) {
    return axios.put(`${API_BASE}/${rootId}/notes/${noteId}`, data);
},

// Delete a note
deleteNote(rootId, noteId) {
    return axios.delete(`${API_BASE}/${rootId}/notes/${noteId}`);
},
```

---

## CSS Styling

```css
/* Add to App.css or create SessionSidePane.css */

.session-detail-layout {
    display: flex;
    gap: 24px;
}

.session-main-content {
    flex: 1;
    min-width: 0;
}

.session-sidepane {
    width: 320px;
    flex-shrink: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 120px);
    position: sticky;
    top: 80px;
}

.sidepane-header {
    padding: 16px;
    border-bottom: 1px solid #333;
}

.sidepane-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.sidepane-tabs .tab {
    flex: 1;
    padding: 8px 12px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    transition: all 0.2s;
}

.sidepane-tabs .tab.active {
    background: #333;
    border-color: #4caf50;
    color: #4caf50;
}

.sidepane-context {
    font-size: 12px;
    color: #666;
}

.sidepane-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

/* Notes Panel */
.notes-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.note-quick-add {
    display: flex;
    gap: 8px;
}

.note-input {
    flex: 1;
    padding: 10px 12px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
}

.note-input:focus {
    outline: none;
    border-color: #4caf50;
}

.note-submit-btn {
    padding: 10px 14px;
    background: #4caf50;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.note-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.notes-section h4 {
    font-size: 12px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 8px;
}

.note-item {
    padding: 10px 12px;
    background: #222;
    border-radius: 6px;
    margin-bottom: 8px;
}

.note-item-time {
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
}

.note-item-content {
    font-size: 14px;
    color: #ddd;
    line-height: 1.4;
}

.note-item-context {
    font-size: 11px;
    color: #4caf50;
    margin-top: 4px;
}

/* History Panel */
.history-selector {
    margin-bottom: 16px;
}

.history-selector label {
    display: block;
    font-size: 12px;
    color: #888;
    margin-bottom: 6px;
}

.history-selector select {
    width: 100%;
    padding: 10px 12px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
}

.history-card {
    padding: 12px;
    background: #222;
    border-radius: 6px;
    margin-bottom: 10px;
}

.history-card-date {
    font-size: 12px;
    color: #4caf50;
    margin-bottom: 8px;
}

.history-card-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.history-metric {
    padding: 4px 8px;
    background: #333;
    border-radius: 4px;
    font-size: 12px;
    color: #ccc;
}

.empty-state {
    text-align: center;
    color: #666;
    font-size: 14px;
    padding: 20px;
}
```

---

## Implementation Phases

### Phase 1: Backend + Data Model (1 day)
- [ ] Add `Note` model to `models.py`
- [ ] Create migration script `migrate_add_notes_table.py`
- [ ] Run migration on all environments
- [ ] Create `blueprints/notes_api.py`
- [ ] Register blueprint in `app.py`
- [ ] Add API functions to `utils/api.js`
- [ ] Write tests for notes API

### Phase 2: Extract Hooks (1 day)
- [ ] Create `hooks/useAutoSave.js`
- [ ] Create `hooks/useSessionData.js`
- [ ] Create `hooks/useActivityInstances.js`
- [ ] Create `hooks/useActivityHandlers.js`
- [ ] Create `hooks/useSessionActions.js`
- [ ] Create `hooks/useSessionNotes.js`
- [ ] Create `hooks/useActivityHistory.js`

### Phase 3: Create Sub-Components (2 days)
- [ ] Create `components/sessionDetail/` directory
- [ ] Create `SessionHeader.jsx`
- [ ] Create `SessionMetadata.jsx`
- [ ] Create `SessionContent.jsx` + `SectionContainer.jsx`
- [ ] Create `SessionActions.jsx`
- [ ] Create `SessionSidePane.jsx`
- [ ] Create `NotesPanel.jsx` + sub-components
- [ ] Create `HistoryPanel.jsx` + sub-components

### Phase 4: Refactor SessionDetail.jsx (1 day)
- [ ] Replace inline logic with hooks
- [ ] Replace JSX sections with sub-components
- [ ] Add side pane integration
- [ ] Update layout to accommodate side pane
- [ ] Verify all functionality still works

### Phase 5: Polish + Testing (1 day)
- [ ] Add CSS styling
- [ ] Add keyboard shortcuts
- [ ] Add loading states
- [ ] Test on various screen sizes
- [ ] Test all note CRUD operations
- [ ] Test activity history display
- [ ] Manual regression test of all session features

---

## Success Criteria

1. **SessionDetail.jsx reduced to ~300 lines** (from 1,415)
2. **Side pane visible on session detail** with Notes and History modes
3. **Notes can be added quickly** with Enter key submission
4. **Previous session notes visible** when working on an activity
5. **Activity history shows previous metrics** to inform current session
6. **All existing functionality preserved** (timers, metrics, completion, etc.)
7. **No regression in auto-save behavior**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing session functionality | Create comprehensive test before refactor |
| Performance with many notes | Add pagination, limit queries |
| CSS conflicts with existing styles | Use BEM naming, scope styles |
| Side pane too wide on small screens | Add responsive breakpoint to collapse |

---

**Estimated Total Effort:** 6-7 days

**Ready to proceed?** Let me know which phase to start with.
