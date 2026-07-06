import React from 'react';
import {
    CalendarIcon,
    FolderIcon,
} from '../atoms/AppIcons';
import { getProgramColor } from '../../utils/programViewModel';
import TargetCard from '../TargetCard';
import styles from './GoalCompletionModal.module.css';

function GoalCompletionModal({
    programs = [],
    targets = [],
    activityDefinitions = [],
    completionDate = new Date(),
    accentColor,
    goalType,
    completionNote = '',
    onCompletionNoteChange,
}) {
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

            <div>
                <label className={styles.sectionLabel} htmlFor="goal-completion-note">
                    Goal Completion Note (optional):
                </label>
                <textarea
                    id="goal-completion-note"
                    className={styles.completionNoteInput}
                    value={completionNote}
                    onChange={(event) => onCompletionNoteChange?.(event.target.value)}
                    placeholder="Capture what changed, what worked, or what to remember from completing this goal."
                    rows={4}
                />
                <p className={styles.completionNoteHint}>
                    Paste a YouTube, Instagram, or Google Drive video link on its own line to embed it as evidence.
                </p>
            </div>

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

            {/* Associated Targets */}
            <div>
                <label className={styles.sectionLabel}>
                    Targets associated with this goal ({targets.length}):
                </label>
                {targets.length === 0 ? (
                    <div className={styles.emptyText}>
                        No targets defined for this goal
                    </div>
                ) : (
                    <div className={styles.listColumn}>
                        {targets.map(target => (
                            <TargetCard
                                key={target.id}
                                target={target}
                                activityDefinitions={activityDefinitions}
                                isCompleted={false}
                                goalType={goalType}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default GoalCompletionModal;
