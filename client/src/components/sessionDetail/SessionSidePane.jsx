/**
 * SessionSidePane - Persistent side panel for session detail view
 * 
 * Provides:
 * - Session info header (compact, expandable)
 * - Details: Session controls and goal hierarchy
 * - Timeline: Activity history and session notes
 */

import React from 'react';
import SessionInfoPanel from './SessionInfoPanel';
import Button from '../atoms/Button';
import SessionCompletionButton from '../common/SessionCompletionButton';
import SidePaneHeader from '../common/SidePaneHeader';
import SessionGoalHierarchyPanel from './SessionGoalHierarchyPanel';
import TimelinePanel from './TimelinePanel';
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
    const timeline = model?.timeline;

    return (
        <div className={`${styles.sessionSidepane} ${embedded ? styles.sessionSidepaneEmbedded : ''}`}>
            {/* Mode Toggle Header */}
            {showModeTabs && (
                <SidePaneHeader>
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
                            className={`${styles.sidepaneTab} ${mode === 'timeline' ? styles.sidepaneTabActive : ''}`}
                            onClick={() => onModeChange('timeline')}
                            aria-pressed={mode === 'timeline'}
                        >
                            Timeline
                        </button>
                    </div>
                </SidePaneHeader>
            )}

            {/* Mode Content */}
            <div className={styles.sidepaneContent}>
                {mode === 'details' ? (
                    <div className={styles.detailsView}>
                        <div className={styles.detailsScroll}>
                            {/* Session Metadata Panel */}
                            <SessionInfoPanel />

                            {/* Session Controls */}
                            <div className={styles.sidebarActions}>
                                <SessionCompletionButton
                                    onClick={details?.onToggleComplete}
                                    completed={details?.isCompleted}
                                    title="Mark Session Complete"
                                    className={!details?.isCompleted ? styles.completePendingButton : ''}
                                />
                                <Button
                                    onClick={details?.onOptions}
                                    variant="primary"
                                    title="Session Options"
                                    className={styles.optionsButton}
                                >
                                    Options
                                </Button>
                            </div>

                            {/* Divider */}
                            <div className={styles.divider}></div>
                        </div>

                        <SessionGoalHierarchyPanel
                            selectedActivity={goals?.selectedActivity}
                            onGoalClick={goals?.onGoalClick}
                            onGoalCreated={goals?.onGoalCreated}
                            onOpenGoals={goals?.onOpenGoals}
                            className={styles.detailsGoalHierarchy}
                        />
                    </div>
                ) : (
                    <TimelinePanel
                        rootId={timeline?.rootId}
                        sessionId={timeline?.sessionId}
                        selectedActivity={timeline?.selectedActivity}
                        sessionActivityDefs={timeline?.sessionActivityDefs}
                        onNoteAdded={timeline?.onNoteAdded}
                        notes={timeline?.notes}
                        previousSessionNotes={timeline?.previousSessionNotes}
                        addNote={timeline?.addNote}
                        updateNote={timeline?.updateNote}
                        deleteNote={timeline?.deleteNote}
                        pinNote={timeline?.pinNote}
                        unpinNote={timeline?.unpinNote}
                    />
                )}
            </div>
        </div>
    );
}

export default SessionSidePane;
