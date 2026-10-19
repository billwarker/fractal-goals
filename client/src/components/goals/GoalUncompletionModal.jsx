import React from 'react';

import {
    CalendarIcon,
    FolderIcon,
} from '../atoms/AppIcons';
import { getProgramColor } from '../../utils/programViewModel';
import NoteCard from '../notes/NoteCard';
import { describeCondition, getGoalCompletionCondition, getGoalCondition } from '../../utils/goalConditions';
import styles from './GoalUncompletionModal.module.css';

function GoalUncompletionModal({
    programs = [],
    goal = null,
    activityDefinitions = [],
    completedAt,
    accentColor,
    goalCompletionNote,
    sequenceResumedStep = null,
    pauseNext = true,
    onPauseNextChange,
}) {
    const completionCondition = getGoalCompletionCondition(goal);
    const condition = getGoalCondition(goal);
    const activity = activityDefinitions.find((candidate) => candidate.id === condition?.activity_definition_id) || null;
    const conditionText = completionCondition === 'activity_threshold' && condition
        ? describeCondition(condition, activity)
        : completionCondition === 'children'
            ? 'When every child goal is complete'
            : 'Manually';
    const completionStyle = { '--completion-confirm-accent': accentColor };
    return (
        <div
            className={styles.container}
            style={completionStyle}
        >
            {/* Originally Completed Date */}
            {completedAt && (
                <div>
                    <label className={styles.fieldLabel}>
                        Was completed on:
                    </label>
                    <div className={styles.completedDate}>
                        <CalendarIcon size={16} />
                        <span>{new Date(completedAt).toLocaleDateString()} at {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            )}

            {/* Associated Programs */}
            <div>
                <label className={styles.fieldLabel}>
                    Programs that will remove this completion:
                </label>
                {programs.length === 0 ? (
                    <div className={styles.emptyText}>
                        No programs have this completion in their date window
                    </div>
                ) : (
                    <div className={styles.list}>
                        {programs.map((program, index) => {
                            const programStyle = { '--program-accent': getProgramColor(program, index) };
                            return (
                            <div
                                key={program.id || program.name}
                                className={styles.listItem}
                                style={programStyle}
                            >
                                <FolderIcon size={16} className={styles.programIcon} />
                                <span className={styles.programName}>{program.name}</span>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {sequenceResumedStep ? (
                <label className={styles.sequenceChoice}>
                    <input
                        type="checkbox"
                        checked={pauseNext}
                        onChange={(event) => onPauseNextChange?.(event.target.checked)}
                    />
                    <span>Pause next goal in sequence: <strong>{sequenceResumedStep.name}</strong> again</span>
                </label>
            ) : null}

            {/* How this goal completes */}
            <div>
                <label className={styles.fieldLabel}>
                    How this goal completes:
                </label>
                <div className={styles.completedDate}>
                    <span>{conditionText}</span>
                </div>
                {completionCondition !== 'manual' ? (
                    <p className={styles.emptyText}>The condition stays in place; new activity that meets it completes the goal again.</p>
                ) : null}
            </div>

            {/* Goal Completion Note */}
            <div>
                <label className={styles.fieldLabel}>
                    Goal Completion Note:
                </label>
                {goalCompletionNote ? (
                    <NoteCard
                        note={goalCompletionNote}
                        compact
                        variant="flat"
                        showContext={false}
                        showTypePill={false}
                        noteTypeVariant="metadata"
                    />
                ) : (
                    <div className={styles.emptyText}>
                        No goal completion note exists for this completion
                    </div>
                )}
            </div>
        </div>
    );
}

export default GoalUncompletionModal;
