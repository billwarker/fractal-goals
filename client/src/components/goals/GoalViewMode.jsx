import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { isGoalAssociatedWithBlock } from '../../utils/programGoalAssociations';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { FolderIcon } from '../atoms/AppIcons';
import NoteCard from '../notes/NoteCard';
import GoalSmartSection from './GoalSmartSection';
import styles from '../GoalDetailModal.module.css';

const TargetManager = lazyWithRetry(() => import('../goalDetail/TargetManager'), 'components/goalDetail/TargetManager');

function GoalViewMode({
    mode,
    goal,
    goalId,
    rootId,
    goalType,
    goalColor,
    parentGoalName,
    parentGoalColor,
    isCompleted,
    levelConfig,
    trackActivities,
    displayMode,
    programs,
    targets,
    associatedActivities,
    activityDefinitions,
    name,
    description,
    deadline,
    relevanceStatement,
    goalCompletionNote,
    // Handlers
    onClose,
    onUpdate,
    setTargets,
    onTargetClick,
    onRequestTargetBuilder,
    readOnly = false,
}) {
    const navigate = useNavigate();
    const hasTargets = Array.isArray(targets) && targets.length > 0;
    const canTrackActivities = trackActivities && levelConfig.track_activities !== false;

    return (
        <div className={styles.viewContainer}>
            {goalCompletionNote && (
                <section className={styles.goalCompletionNoteSection}>
                    <label className={styles.label}>
                        Goal Completion Note
                    </label>
                    <NoteCard
                        note={goalCompletionNote}
                        compact
                        variant="flat"
                        showContext={false}
                        showTypePill={false}
                        noteTypeVariant="metadata"
                    />
                </section>
            )}

            <GoalSmartSection
                goal={goal}
                goalColor={goalColor}
                parentGoalName={parentGoalName}
                parentGoalColor={parentGoalColor}
                mode={mode}
                goalType={goalType}
                relevanceStatement={relevanceStatement}
            />

            {/* Associated Programs */}
            {programs && (() => {
                const associatedPrograms = programs.filter(p => {
                    // Check directly on program
                    const programLevel = p.goal_ids && p.goal_ids.includes(goalId);
                    // A goal belongs to a block whenever its deadline falls inside the block range.
                    const blockLevel = p.blocks && p.blocks.some((block) => isGoalAssociatedWithBlock(goal, block));
                    return programLevel || blockLevel;
                });

                if (associatedPrograms.length === 0) return null;

                return (
                    <div>
                        <label className={styles.label} style={{ marginBottom: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)' }}>
                            Associated Programs
                        </label>
                        <div className={styles.associatedPrograms}>
                            {associatedPrograms.map(prog => (
                                <div
                                    key={prog.id}
                                    onClick={() => {
                                        if (displayMode === 'modal' && onClose) onClose();
                                        navigate(`/${rootId}/programs/${prog.id}`);
                                    }}
                                    className={styles.programLink}
                                >
                                    <FolderIcon size={14} />
                                    <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{prog.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Targets Section - View Mode (Read-only) */}
            {(hasTargets || canTrackActivities) && (
                <Suspense fallback={null}>
                    <TargetManager
                        targets={targets}
                        setTargets={setTargets}
                        activityDefinitions={activityDefinitions}
                        associatedActivities={associatedActivities}
                        goalId={goalId}
                        rootId={rootId}
                        isEditing={false}
                        viewMode="list"
                        onSave={readOnly ? undefined : (newTargets) => {
                            if (onUpdate && goalId) {
                                onUpdate(goalId, {
                                    name,
                                    description,
                                    deadline,
                                    relevance_statement: relevanceStatement,
                                    targets: newTargets
                                });
                            }
                        }}
                        headerColor="var(--color-text-primary)"
                        goalType={goalType}
                        goalCompleted={isCompleted}
                        onTargetClick={readOnly ? undefined : onTargetClick}
                        onRequestBuilder={readOnly ? undefined : onRequestTargetBuilder}
                        readOnly={readOnly}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default GoalViewMode;
