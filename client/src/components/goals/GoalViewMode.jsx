import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { FolderIcon } from '../atoms/AppIcons';
import NoteCard from '../notes/NoteCard';
import GoalSmartSection from './GoalSmartSection';
import styles from '../GoalDetailModal.module.css';

const GoalChartsCarousel = lazyWithRetry(() => import('../goalCharts/GoalChartsCarousel'), 'components/goalCharts/GoalChartsCarousel');
const CompletionConditionSummary = lazyWithRetry(() => import('../goalDetail/CompletionConditionSummary'), 'components/goalDetail/CompletionConditionSummary');

function GoalViewMode({
    mode,
    goal,
    goalId,
    rootId,
    goalColor,
    displayMode,
    programs,
    activityDefinitions,
    name,
    levelConfig = null,
    goalCompletionNote,
    conditionSnapshot = null,
    // Handlers
    onClose,
    onCompleteNow,
    chartExpansion = null,
    portalTarget = null,
    overlayClassName = '',
    readOnly = false,
}) {
    const navigate = useNavigate();

    return (
        <div className={styles.viewContainer}>
            <div className={styles.goalOverview}>
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
                mode={mode}
                usesReviews={Boolean(levelConfig?.uses_reviews)}
            />

            {/* Associated Programs */}
            {programs && (() => {
                const associatedPrograms = programs.filter((p) => (p.goal_ids || []).includes(goalId));

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

            {mode !== 'create' && !readOnly && (
                <Suspense fallback={null}>
                    <GoalChartsCarousel
                        rootId={rootId}
                        goal={goal}
                        goalId={goalId}
                        chartExpansion={chartExpansion}
                        portalTarget={portalTarget}
                    />
                </Suspense>
            )}

            {mode !== 'create' && (
                <Suspense fallback={null}>
                    <CompletionConditionSummary
                        goal={goal}
                        goalId={goalId}
                        goalName={name}
                        rootId={rootId}
                        goalColor={goalColor}
                        activityDefinitions={activityDefinitions}
                        readOnly={readOnly}
                        snapshot={conditionSnapshot}
                        onCompleteNow={onCompleteNow}
                        chartShowsProgress={!readOnly}
                        portalContainer={portalTarget}
                        overlayClassName={overlayClassName}
                    />
                </Suspense>
            )}
            </div>
        </div>
    );
}

export default GoalViewMode;
