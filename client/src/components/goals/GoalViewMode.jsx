import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { isGoalAssociatedWithBlock } from '../../utils/programGoalAssociations';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import GoalSmartSection from './GoalSmartSection';
import GoalChildrenList from './GoalChildrenList';
import { formatDurationSeconds as formatDuration } from '../../utils/formatters';
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
    completedViaChildren,
    childType,
    displayMode,
    programs,
    metrics,
    targets,
    associatedActivities,
    activityDefinitions,
    treeData,
    name,
    description,
    deadline,
    relevanceStatement,
    // Handlers
    setViewState,
    onClose,
    onGoalSelect,
    onUpdate,
    setTargets,
    handleTimeSpentClick,
}) {
    const navigate = useNavigate();
    const { getGoalColor } = useGoalLevels();

    return (
        <div className={styles.viewContainer}>
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
                                    <span style={{ fontSize: '14px' }}>📁</span>
                                    <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{prog.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Updated Metrics Section - Centered between other sections */}
            {metrics && (
                <div className={styles.metricsContainer}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        columnGap: '24px',
                        rowGap: '12px'
                    }}>
                        {/* Metric Item: Time */}
                        <div
                            onClick={handleTimeSpentClick}
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '4px 0',
                                gap: '6px'
                            }}
                        >
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: 'var(--color-text-primary)',
                                textDecoration: 'underline'
                            }}>
                                Time Spent:
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                {formatDuration(metrics.recursive.activities_duration_seconds)}
                            </span>
                        </div>

                        {/* Metric Item: Sessions */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '4px 0',
                            gap: '6px'
                        }}>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                Sessions:
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                {metrics.recursive.sessions_count}
                            </span>
                        </div>

                        {/* Metric Item: Activities */}
                        <div
                            onClick={() => setViewState('activity-associator')}
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '4px 0',
                                gap: '6px'
                            }}
                        >
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: 'var(--color-text-primary)',
                                textDecoration: 'underline'
                            }}>
                                Activities:
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                {associatedActivities ? associatedActivities.length : metrics.recursive.activities_count}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Targets Section - View Mode (Read-only) */}
            {trackActivities && levelConfig.track_activities !== false && (
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
                        onSave={(newTargets) => {
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
                    />
                </Suspense>
            )}

            {/* Associated Children Section */}
            <GoalChildrenList
                treeData={treeData}
                goalId={goalId}
                goalColor={goalColor}
                childType={childType}
                onGoalSelect={onGoalSelect}
            />
        </div>
    );
}

export default GoalViewMode;
