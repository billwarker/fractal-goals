/**
 * SessionSidePane - Persistent side panel for session detail view
 * 
 * Provides:
 * - Session info header (compact, expandable)
 * - Notes: Quick-add notes, timeline of session notes, previous session notes
 * - History: View previous activity instance metrics
 */

import React, { useState, useMemo } from 'react';
import SessionInfoPanel from './SessionInfoPanel';
import NotesPanel from './NotesPanel';
import HistoryPanel from './HistoryPanel';
import './SessionSidePane.css';

function SessionSidePane({
    rootId,
    sessionId,
    session,              // Session object for info panel
    sessionData,          // Session data (dates, template, etc.)
    parentGoals,          // Short-term goals
    totalDuration,        // Total completed duration in seconds
    selectedActivity,     // Currently focused activity instance (for context)
    activityInstances,    // All activity instances in session
    activityDefinitions,  // Activity definitions for lookup
    onNoteAdded,          // Callback when note is added
    onGoalClick,          // Callback when goal badge is clicked
    refreshTrigger        // Counter to trigger notes refresh
}) {
    const [mode, setMode] = useState('notes'); // 'notes' | 'history'

    // Get unique activity definitions from current session
    const sessionActivityDefs = useMemo(() => {
        if (!activityInstances || !activityDefinitions) return [];

        const defIds = new Set(activityInstances.map(i => i.activity_definition_id));
        return activityDefinitions.filter(d => defIds.has(d.id));
    }, [activityInstances, activityDefinitions]);

    // Get the activity definition for the selected activity
    const selectedActivityDef = useMemo(() => {
        if (!selectedActivity || !activityDefinitions) return null;
        return activityDefinitions.find(d => d.id === selectedActivity.activity_definition_id);
    }, [selectedActivity, activityDefinitions]);

    return (
        <div className="session-sidepane">
            {/* Session Info Header */}
            {session && (
                <SessionInfoPanel
                    session={session}
                    sessionData={sessionData}
                    parentGoals={parentGoals}
                    rootId={rootId}
                    onGoalClick={onGoalClick}
                    totalDuration={totalDuration}
                />
            )}

            {/* Mode Toggle Header */}
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

                {/* Context indicator */}
                <div className="sidepane-context">
                    {mode === 'notes' && (
                        selectedActivity ? (
                            <span>📌 {selectedActivityDef?.name || 'Activity'}</span>
                        ) : (
                            <span>Session Notes</span>
                        )
                    )}
                    {mode === 'history' && selectedActivityDef && (
                        <span>📌 {selectedActivityDef.name}</span>
                    )}
                </div>
            </div>

            {/* Mode Content */}
            <div className="sidepane-content">
                {mode === 'notes' ? (
                    <NotesPanel
                        rootId={rootId}
                        sessionId={sessionId}
                        selectedActivity={selectedActivity}
                        selectedActivityDef={selectedActivityDef}
                        onNoteAdded={onNoteAdded}
                        activityInstances={activityInstances}
                        activityDefinitions={activityDefinitions}
                        refreshTrigger={refreshTrigger}
                    />
                ) : (
                    <HistoryPanel
                        rootId={rootId}
                        sessionId={sessionId}
                        selectedActivity={selectedActivity}
                        sessionActivityDefs={sessionActivityDefs}
                    />
                )}
            </div>
        </div>
    );
}

export default SessionSidePane;
