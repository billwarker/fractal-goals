import React from 'react';
import {
    CalendarIcon,
    FolderIcon,
} from '../atoms/AppIcons';
import { getProgramColor } from '../../utils/programViewModel';
import CompletionNoteFields from './CompletionNoteFields';
import { getGoalCompletionCondition, getGoalCondition } from '../../utils/goalConditions';
import { describeCondition } from '../../utils/goalConditionText';
import styles from './GoalCompletionModal.module.css';

function GoalCompletionModal({
    programs = [],
    goal = null,
    activityDefinitions = [],
    completionDate = new Date(),
    accentColor,
    completionNote = '',
    onCompletionNoteChange,
    sequenceNextStep = null,
    beginNext = true,
    onBeginNextChange,
    attachmentDraft = null,
}) {
    const completionCondition = getGoalCompletionCondition(goal);
    const condition = getGoalCondition(goal);
    const activity = activityDefinitions.find((candidate) => candidate.id === condition?.activity_definition_id) || null;
    const conditionText = completionCondition === 'activity_threshold' && condition
        ? describeCondition(condition, activity)
        : completionCondition === 'children'
            ? 'When every child goal is complete'
            : 'Manually';
    return (
        <div
            className={styles.container}
            style={{ '--completion-confirm-accent': accentColor }}
        >
            {/* Completion Date */}
            <div>
                <label className={styles.sectionLabel}>
                    Will be marked as completed:
                </label>
                <div className={styles.infoBox}>
                    <CalendarIcon size={16} />
                    <span>{completionDate.toLocaleDateString()} at {completionDate.toLocaleTimeString()}</span>
                </div>
            </div>

            <CompletionNoteFields
                value={completionNote}
                onChange={onCompletionNoteChange}
                attachmentDraft={attachmentDraft}
            />

            {/* Associated Programs */}
            <div>
                <label className={styles.sectionLabel}>
                    Programs that will log this completion:
                </label>
                {programs.length === 0 ? (
                    <div className={styles.emptyText}>
                        No active programs will log this completion
                    </div>
                ) : (
                    <div className={styles.listColumn}>
                        {programs.map((program, index) => (
                            <div
                                key={program.id || program.name}
                                className={styles.listItem}
                                style={{ '--program-accent': getProgramColor(program, index) }}
                            >
                                <FolderIcon size={16} className={styles.programIcon} />
                                <span className={styles.programName}>{program.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {sequenceNextStep ? (
                <label className={styles.sequenceChoice}>
                    <input
                        type="checkbox"
                        checked={beginNext}
                        onChange={(event) => onBeginNextChange?.(event.target.checked)}
                    />
                    <span>Begin next goal in sequence: <strong>{sequenceNextStep.name}</strong></span>
                </label>
            ) : null}

            {/* How this goal completes */}
            <div>
                <label className={styles.sectionLabel}>
                    How this goal completes:
                </label>
                <div className={styles.infoBox}>
                    <span>{conditionText}</span>
                </div>
                {completionCondition !== 'manual' ? (
                    <p className={styles.completionNoteHint}>If its condition isn’t met yet, this is recorded as a manual override.</p>
                ) : null}
            </div>
        </div>
    );
}

export default GoalCompletionModal;
