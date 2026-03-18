/**
 * SessionSidePane - Persistent side panel for session detail view
 * 
 * Provides:
 * - Session info header (compact, expandable)
 * - Notes: Quick-add notes, timeline of session notes, previous session notes
 * - History: View previous activity instance metrics
 */

import React from 'react';
import SessionInfoPanel from './SessionInfoPanel';
import Button from '../atoms/Button';
import SessionCompletionButton from '../common/SessionCompletionButton';
import GoalsPanel from './GoalsPanel';
import NotesPanel from './NotesPanel';
import HistoryPanel from './HistoryPanel';
import styles from './SessionSidePane.module.css';

function SessionSidePane({
    model,
    showModeTabs = true,
    embedded = false
}) {
    const mode = model?.mode || 'details';
    const onModeChange = model?.onModeChange;
    const details = model?.details;
    const goals = model?.goals;
    const history = model?.history;

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
                            <SessionCompletionButton
                                onClick={details?.onToggleComplete}
                                completed={details?.isCompleted}
                                title="Mark Session Complete"
                            />
                            <Button
                                onClick={details?.onSave}
                                variant="primary" // Blue
                                title="Save & Exit"
                            >
                                Save
                            </Button>
                            <Button
                                onClick={details?.onPauseResume}
                                variant="secondary"
                                title={details?.isPaused ? "Resume Session" : "Pause Session"}
                                disabled={details?.isCompleted}
                            >
                                {details?.isPaused ? "Resume" : "Pause"}
                            </Button>
                            <Button
                                onClick={details?.onDelete}
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
                            {...details?.notesPanelProps}
                        />
                    </div>
                ) : mode === 'goals' ? (
                    <GoalsPanel
                        selectedActivity={goals?.selectedActivity}
                        onGoalClick={goals?.onGoalClick}
                        onGoalCreated={goals?.onGoalCreated}
                        onOpenGoals={goals?.onOpenGoals}
                    />
                ) : (
                    <HistoryPanel
                        rootId={history?.rootId}
                        sessionId={history?.sessionId}
                        selectedActivity={history?.selectedActivity}
                        sessionActivityDefs={history?.sessionActivityDefs}
                    />
                )}
            </div>
        </div>
    );
}

export default SessionSidePane;
