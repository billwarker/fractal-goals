import React from 'react';
import { GOAL_COLORS } from '../../utils/goalColors';
import StepHeader from './StepHeader';
import ImmediateGoalSection from './ImmediateGoalSection';

/**
 * Step 2: Associate with Goals
 * Displays STGs with selectable checkboxes and nested IGs
 */
function GoalAssociation({
    goals,
    selectedGoalIds,
    selectedImmediateGoalIds,
    immediateGoals,
    onToggleGoal,
    onToggleImmediateGoal,
    onRemoveImmediateGoal,
    onCreateImmediateGoal
}) {
    return (
        <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader
                stepNumber={2}
                title="Associate with Goals"
                subtitle="Select short-term goals and optionally attach their immediate goals to this session."
            />

            {goals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    <p>No short-term goals found. Create goals in the Goals page first.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {goals.map(stg => {
                        const isSelected = selectedGoalIds.includes(stg.id);
                        const stgImmediateGoals = stg.immediateGoals || [];
                        const newGoalsForSTG = immediateGoals.filter(g => g.parent_id === stg.id);
                        const hasImmediateGoals = stgImmediateGoals.length > 0;
                        const hasNewGoals = newGoalsForSTG.length > 0;

                        return (
                            <div key={stg.id} style={{
                                border: `2px solid ${isSelected ? GOAL_COLORS.ShortTermGoal : '#444'}`,
                                borderRadius: '8px',
                                overflow: 'hidden',
                                transition: 'all 0.2s'
                            }}>
                                {/* Short-Term Goal Header */}
                                <ShortTermGoalHeader
                                    stg={stg}
                                    isSelected={isSelected}
                                    totalImmediateCount={stgImmediateGoals.length + newGoalsForSTG.length}
                                    hasImmediateGoals={hasImmediateGoals || hasNewGoals}
                                    onClick={() => onToggleGoal(stg.id)}
                                />

                                {/* Immediate Goals Section - Show when STG is selected */}
                                {isSelected && (
                                    <ImmediateGoalSection
                                        stgId={stg.id}
                                        existingImmediateGoals={stgImmediateGoals}
                                        newImmediateGoals={newGoalsForSTG}
                                        selectedImmediateGoalIds={selectedImmediateGoalIds}
                                        onToggleExistingGoal={onToggleImmediateGoal}
                                        onRemoveNewGoal={onRemoveImmediateGoal}
                                        onCreateNewGoal={() => onCreateImmediateGoal(stg)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ShortTermGoalHeader({ stg, isSelected, totalImmediateCount, hasImmediateGoals, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: isSelected ? `${GOAL_COLORS.ShortTermGoal}1A` : '#2a2a2a',
                padding: '14px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}
        >
            <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '4px',
                border: `2px solid ${isSelected ? GOAL_COLORS.ShortTermGoal : '#666'}`,
                background: isSelected ? GOAL_COLORS.ShortTermGoal : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {isSelected && '✓'}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: isSelected ? GOAL_COLORS.ShortTermGoal : 'white' }}>
                    {stg.name}
                </div>
                {stg.description && (
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                        {stg.description}
                    </div>
                )}
            </div>
            {hasImmediateGoals && (
                <div style={{
                    fontSize: '11px',
                    color: '#888',
                    padding: '2px 8px',
                    background: '#333',
                    borderRadius: '10px'
                }}>
                    {totalImmediateCount} immediate goal{totalImmediateCount !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    );
}

export default GoalAssociation;
