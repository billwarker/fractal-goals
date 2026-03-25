import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
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
    textColor,
    parentGoalName,
    parentGoalColor,
    isCompleted,
    levelConfig,
    allowManualCompletion,
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
    isFrozen,
    // Handlers
    setViewState,
    setIsEditing,
    onClose,
    onToggleCompletion,
    onAddChild,
    onGoalSelect,
    onUpdate,
    setTargets,
    handleTimeSpentClick,
}) {
    const navigate = useNavigate();
    const { getGoalColor } = useGoalLevels();
    const childGoalColor = childType ? getGoalColor(childType) : goalColor;

    return (
        <div className={styles.viewContainer}>

            {/* Action Buttons - 2x2 Grid */}
            <div className={styles.actionGrid}>
                {onToggleCompletion && (() => {
                    const isManualAllowed = levelConfig.allow_manual_completion !== false;
                    const canShowManual = allowManualCompletion && isManualAllowed && !isFrozen;
                    const canToggleCompletion = !isFrozen && (isCompleted || canShowManual);
                    const isTargetsAllowed = levelConfig.track_activities !== false && goalType !== 'NanoGoal';
                    const isChildrenAllowed = !isExecutionGoalType(goalType);

                    return (
                        <button
                            onClick={() => {
                                if (isFrozen) {
                                    return;
                                }
                                if (isCompleted) {
                                    setViewState('uncomplete-confirm');
                                } else if (canShowManual) {
                                    setViewState('complete-confirm');
                                }
                            }}
                            disabled={!canToggleCompletion}
                            className={styles.btnAction}
                            style={{
                                background: isFrozen
                                    ? 'rgba(30, 58, 95, 0.16)'
                                    : isCompleted
                                        ? '#4caf50'
                                        : 'transparent',
                                border: `1px solid ${isFrozen
                                    ? 'rgba(100, 181, 246, 0.35)'
                                    : isCompleted
                                        ? '#4caf50'
                                        : (canShowManual ? 'var(--color-border)' : 'var(--color-border-hover)')}`,
                                color: isFrozen
                                    ? '#93c5fd'
                                    : isCompleted
                                        ? 'white'
                                        : (canShowManual ? 'var(--color-text-primary)' : 'var(--color-text-muted)'),
                                cursor: canToggleCompletion ? 'pointer' : 'default',
                                fontWeight: (isCompleted || isFrozen) ? 'bold' : 'normal',
                                opacity: canToggleCompletion ? 1 : 0.8
                            }}
                        >
                            {isFrozen ? 'Frozen' : isCompleted ? '✓ Completed' : (
                                canShowManual ? 'Mark Complete' : (
                                    trackActivities && isTargetsAllowed && completedViaChildren && isChildrenAllowed ? 'Complete via Children & Targets' :
                                        trackActivities && isTargetsAllowed ? 'Complete via Target(s)' :
                                            completedViaChildren && isChildrenAllowed ? 'Complete via Children' :
                                                'Auto-completing...'
                                )
                            )}
                        </button>
                    );
                })()}

                {onAddChild && childType && (
                    <button
                        onClick={() => {
                            if (goalType === 'ImmediateGoal') return;
                            if (displayMode === 'modal' && onClose) onClose();
                            onAddChild(goal);
                        }}
                        className={styles.btnAction}
                        disabled={goalType === 'ImmediateGoal'}
                        title={goalType === 'ImmediateGoal' ? "MicroGoals can only be created from the Session Detail page" : ""}
                        style={{
                            background: 'transparent',
                            border: `1px solid ${childGoalColor}`,
                            color: childGoalColor,
                            fontWeight: 'bold',
                            opacity: goalType === 'ImmediateGoal' ? 0.5 : 1,
                            cursor: goalType === 'ImmediateGoal' ? 'not-allowed' : 'pointer'
                        }}
                    >
                        + Add {childType}
                    </button>
                )}

                <button
                    onClick={() => setIsEditing(true)}
                    className={styles.btnAction}
                    style={{
                        background: goalColor,
                        border: 'none',
                        color: textColor,
                        fontWeight: 600
                    }}
                >
                    Edit Goal
                </button>

                <button
                    onClick={() => setViewState('goal-options')}
                    className={styles.btnAction}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 600,
                    }}
                >
                    Options
                </button>

            </div>

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
                        <label className={styles.label} style={{ marginBottom: '6px', color: goalColor, fontSize: 'var(--font-size-xs)' }}>
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
                                color: goalColor,
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
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: goalColor }}>
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
                                color: goalColor,
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
            {trackActivities && levelConfig.track_activities !== false && goalType !== 'NanoGoal' && (
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
                        headerColor={goalColor}
                        goalType={goalType}
                        goalCompleted={isCompleted}
                    />
                </Suspense>
            )}

            {/* Associated Children Section */}
            {goalType !== 'NanoGoal' && (
                <GoalChildrenList
                    treeData={treeData}
                    goalId={goalId}
                    goalColor={goalColor}
                    childType={childType}
                    onGoalSelect={onGoalSelect}
                />
            )}
        </div>
    );
}

export default GoalViewMode;
