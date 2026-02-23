/**
 * SessionSidePane - Persistent side panel for session detail view
 * 
 * Provides:
 * - Session info header (compact, expandable)
 * - Notes: Quick-add notes, timeline of session notes, previous session notes
 * - History: View previous activity instance metrics
 */

import React, { useMemo } from 'react';
import SessionInfoPanel from './SessionInfoPanel';
import Button from '../atoms/Button';
import GoalsPanel from './GoalsPanel';
import NotesPanel from './NotesPanel';
import HistoryPanel from './HistoryPanel';
import styles from './SessionSidePane.module.css';

import { useActiveSession } from '../../contexts/ActiveSessionContext';

function SessionSidePane({
    selectedActivity,     // Currently focused activity instance (for context)
    selectedSetIndex,     // Currently focused set index (null = whole activity)
    onNoteAdded,          // Callback when note is added
    onGoalClick,          // Callback when goal badge is clicked
    onGoalCreated,        // Callback when goal is created
    refreshTrigger,       // Counter to trigger notes refresh
    notes,
    previousNotes,
    previousSessionNotes,
    addNote,
    updateNote,
    deleteNote,
    // Control Props
    onCancel,
    onSave,
    onDelete,              // Trigger for confirmation modal
    onSessionChange,
    mode = 'details',      // Controlled mode
    onModeChange,          // Callback for mode change
    createMicroTrigger,     // Trigger for auto-creation
    goalCreationContext,
    onOpenGoals,
    showModeTabs = true,
    embedded = false
}) {
    // Context
    const {
        rootId,
        sessionId,
        session,
        activityInstances,
        activities: activityDefinitions,
        targetAchievements,
        achievedTargetIds,
        toggleSessionComplete: onToggleComplete,
        pauseSession,
        resumeSession,
    } = useActiveSession();

    // Derived values
    const isCompleted = session?.attributes?.completed;

    // mode state lifted to parent (SessionDetail)

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
        <div className={`${styles.sessionSidepane} ${embedded ? styles.sessionSidepaneEmbedded : ''}`}>
            {/* Mode Toggle Header */}
            {showModeTabs && (
                <div className={styles.sidepaneHeader}>
                    <div className={styles.sidepaneTabs}>
                        <button
                            type="button"
                            className={`${styles.sidepaneTab} ${mode === 'details' ? styles.sidepaneTabActive : ''}`}
                            onClick={() => onModeChange('details')}
                            aria-pressed={mode === 'details'}
                        >
                            Details
                        </button>
                        <button
                            type="button"
                            className={`${styles.sidepaneTab} ${mode === 'goals' ? styles.sidepaneTabActive : ''}`}
                            onClick={() => onModeChange('goals')}
                            aria-pressed={mode === 'goals'}
                        >
                            Goals
                        </button>
                        <button
                            type="button"
                            className={`${styles.sidepaneTab} ${mode === 'history' ? styles.sidepaneTabActive : ''}`}
                            onClick={() => onModeChange('history')}
                            aria-pressed={mode === 'history'}
                        >
                            History
                        </button>
                    </div>
                </div>
            )}

            {/* Mode Content */}
            <div className={styles.sidepaneContent}>
                {mode === 'details' ? (
                    <div className={styles.detailsView}>
                        {/* Session Metadata Panel */}
                        <SessionInfoPanel />

                        {/* Session Controls */}
                        <div className={styles.sidebarActions}>
                            <Button
                                onClick={onToggleComplete}
                                variant={isCompleted ? 'success' : 'secondary'}
                                title="Mark Session Complete"
                            >
                                {isCompleted ? '✓ Done' : 'Complete'}
                            </Button>
                            <Button
                                onClick={onSave}
                                variant="primary" // Blue
                                title="Save & Exit"
                            >
                                Save
                            </Button>
                            <Button
                                onClick={() => session?.is_paused ? resumeSession() : pauseSession()}
                                variant="secondary"
                                title={session?.is_paused ? "Resume Session" : "Pause Session"}
                                disabled={isCompleted}
                            >
                                {session?.is_paused ? "Resume" : "Pause"}
                            </Button>
                            <Button
                                onClick={onDelete}
                                variant="danger" // Red
                                title="Delete Session"
                            >
                                Delete
                            </Button>
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
                ) : mode === 'goals' ? (
                    <GoalsPanel
                        selectedActivity={selectedActivity}
                        onGoalClick={onGoalClick}
                        onGoalCreated={onGoalCreated}
                        createMicroTrigger={createMicroTrigger}
                        goalCreationContext={goalCreationContext}
                        onOpenGoals={onOpenGoals}
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
