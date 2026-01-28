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
import styles from './SessionSidePane.module.css';

function SessionSidePane({
    rootId,
    sessionId,
    session,              // Session object for info panel
    sessionData,          // Session data (dates, template, etc.)
    parentGoals,          // Short-term goals
    totalDuration,        // Total completed duration in seconds
    selectedActivity,     // Currently focused activity instance (for context)
    selectedSetIndex,     // Currently focused set index (null = whole activity)
    activityInstances,    // All activity instances in session
    activityDefinitions,  // Activity definitions for lookup
    onNoteAdded,          // Callback when note is added
    onGoalClick,          // Callback when goal badge is clicked
    refreshTrigger,       // Counter to trigger notes refresh
    notes,
    previousNotes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote,
    // Control Props
    onDelete,
    onCancel,
    onToggleComplete,
    onSave,
    isCompleted,
    onSessionChange
}) {
    const [mode, setMode] = useState('details'); // 'details' | 'history'

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
        <div className={styles.sessionSidepane}>
            {/* Mode Toggle Header */}
            <div className={styles.sidepaneHeader}>
                <div className={styles.sidepaneTabs}>
                    <button
                        className={`${styles.sidepaneTab} ${mode === 'details' ? styles.sidepaneTabActive : ''}`}
                        onClick={() => setMode('details')}
                    >
                        Details
                    </button>
                    <button
                        className={`${styles.sidepaneTab} ${mode === 'history' ? styles.sidepaneTabActive : ''}`}
                        onClick={() => setMode('history')}
                    >
                        History
                    </button>
                </div>


            </div>

            {/* Mode Content */}
            <div className={styles.sidepaneContent}>
                {mode === 'details' ? (
                    <div className={styles.detailsView}>
                        {/* Session Metadata Panel */}
                        <SessionInfoPanel
                            session={session}
                            sessionData={sessionData}
                            parentGoals={parentGoals}
                            rootId={rootId}
                            onGoalClick={onGoalClick}
                            totalDuration={totalDuration}
                            onSessionUpdate={onSessionChange}
                        />

                        {/* Session Controls */}
                        <div className={styles.sidebarActions}>
                            <button
                                onClick={onToggleComplete}
                                className={`${styles.sidebarControlBtn} ${styles.btnComplete} ${isCompleted ? styles.btnCompleteActive : ''}`}
                                title="Mark Session Complete"
                            >
                                {isCompleted ? '✓ Done' : 'Complete'}
                            </button>
                            <button
                                onClick={onSave}
                                className={`${styles.sidebarControlBtn} ${styles.btnDone}`}
                                title="Save & Exit"
                            >
                                Save
                            </button>
                            <button
                                onClick={onCancel}
                                className={`${styles.sidebarControlBtn} ${styles.btnCancel}`}
                                title="Cancel (Go Back)"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onDelete}
                                className={`${styles.sidebarControlBtn} ${styles.btnDelete}`}
                                title="Delete Session"
                            >
                                Delete
                            </button>
                        </div>

                        {/* Divider */}
                        <div className={styles.divider}></div>

                        {/* Notes Management */}
                        <NotesPanel
                            rootId={rootId}
                            sessionId={sessionId}
                            selectedActivity={selectedActivity}
                            selectedActivityDef={selectedActivityDef}
                            selectedSetIndex={selectedSetIndex}
                            onNoteAdded={onNoteAdded}
                            activityInstances={activityInstances}
                            activityDefinitions={activityDefinitions}
                            refreshTrigger={refreshTrigger}
                            notes={notes}
                            previousNotes={previousNotes}
                            previousSessionNotes={previousSessionNotes}
                            addNote={addNote}
                            updateNote={updateNote}
                            deleteNote={deleteNote}
                        />
                    </div>
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
