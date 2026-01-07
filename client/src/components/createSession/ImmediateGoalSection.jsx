import React from 'react';
import { GOAL_COLORS } from '../../utils/goalColors';

/**
 * Immediate Goals Section within a Short-Term Goal card
 * Handles existing IG checkboxes, newly created IGs, and add button
 */
function ImmediateGoalSection({
    stgId,
    existingImmediateGoals,
    newImmediateGoals,
    selectedImmediateGoalIds,
    onToggleExistingGoal,
    onRemoveNewGoal,
    onCreateNewGoal
}) {
    const hasExistingGoals = existingImmediateGoals.length > 0;
    const hasNewGoals = newImmediateGoals.length > 0;

    return (
        <div style={{
            background: '#1a1a1a',
            padding: '12px 16px',
            borderTop: '1px solid #333'
        }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: GOAL_COLORS.ImmediateGoal }}>◇</span>
                Immediate Goals (optional)
            </div>

            {/* Existing Immediate Goals as Checkboxes */}
            {hasExistingGoals && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: hasNewGoals ? '12px' : '0' }}>
                    {existingImmediateGoals.map(ig => (
                        <ExistingGoalCheckbox
                            key={ig.id}
                            goal={ig}
                            isSelected={selectedImmediateGoalIds.includes(ig.id)}
                            onToggle={() => onToggleExistingGoal(ig.id)}
                        />
                    ))}
                </div>
            )}

            {/* Newly Created Immediate Goals */}
            {hasNewGoals && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {newImmediateGoals.map(ig => (
                        <NewGoalCard
                            key={ig.tempId}
                            goal={ig}
                            onRemove={() => onRemoveNewGoal(ig.tempId)}
                        />
                    ))}
                </div>
            )}

            {/* Add Immediate Goal Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onCreateNewGoal();
                }}
                style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: `1px dashed ${GOAL_COLORS.ImmediateGoal}50`,
                    borderRadius: '4px',
                    color: GOAL_COLORS.ImmediateGoal,
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${GOAL_COLORS.ImmediateGoal}10`;
                    e.currentTarget.style.borderStyle = 'solid';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderStyle = 'dashed';
                }}
            >
                + Create New Immediate Goal
            </button>
        </div>
    );
}

function ExistingGoalCheckbox({ goal, isSelected, onToggle }) {
    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: isSelected ? `${GOAL_COLORS.ImmediateGoal}15` : '#252525',
                border: `1px solid ${isSelected ? GOAL_COLORS.ImmediateGoal : '#333'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
            }}
        >
            <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '3px',
                border: `2px solid ${isSelected ? GOAL_COLORS.ImmediateGoal : '#555'}`,
                background: isSelected ? GOAL_COLORS.ImmediateGoal : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a',
                fontSize: '12px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {isSelected && '✓'}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: isSelected ? GOAL_COLORS.ImmediateGoal : '#ccc' }}>
                    {goal.name}
                </div>
                {goal.deadline && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                        📅 {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                )}
            </div>
            {goal.completed && (
                <span style={{ fontSize: '11px', color: '#4caf50' }}>✓ Done</span>
            )}
        </div>
    );
}

function NewGoalCard({ goal, onRemove }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: `${GOAL_COLORS.ImmediateGoal}15`,
                border: `1px solid ${GOAL_COLORS.ImmediateGoal}`,
                borderRadius: '4px'
            }}
        >
            <span style={{ fontSize: '12px', color: '#4caf50' }}>✨ New</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: GOAL_COLORS.ImmediateGoal }}>
                    {goal.name}
                </div>
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                style={{
                    padding: '4px 8px',
                    background: '#d32f2f',
                    border: 'none',
                    borderRadius: '3px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '11px'
                }}
            >
                ×
            </button>
        </div>
    );
}

export default ImmediateGoalSection;
