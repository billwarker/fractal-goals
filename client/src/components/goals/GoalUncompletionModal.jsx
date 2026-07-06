import React from 'react';

import {
    AlertTriangleIcon,
    CalendarIcon,
    FolderIcon,
} from '../atoms/AppIcons';
import { getProgramColor } from '../../utils/programViewModel';
import TargetCard from '../TargetCard';
import styles from './GoalUncompletionModal.module.css';

function GoalUncompletionModal({
    programs = [],
    targets = [],
    activityDefinitions = [],
    completedAt,
    accentColor,
    goalType,
}) {
    return (
        <div
            className={styles.container}
            style={{ '--completion-confirm-accent': accentColor }}
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

            {/* Warning */}
            <div className={styles.warning}>
                <AlertTriangleIcon size={16} />
                <span>This will remove the completion status, completion date, and goal completion note from this goal.</span>
            </div>

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
                <label className={styles.fieldLabel}>
                    Targets that will be marked incomplete ({targets.length}):
                </label>
                {targets.length === 0 ? (
                    <div className={styles.emptyText}>
                        No targets defined for this goal
                    </div>
                ) : (
                    <div className={styles.list}>
                        {targets.map(target => (
                            <TargetCard
                                key={target.id}
                                target={target}
                                activityDefinitions={activityDefinitions}
                                isCompleted={true}
                                goalType={goalType}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default GoalUncompletionModal;
