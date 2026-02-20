import React from 'react';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;

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
    const { getGoalColor } = useGoalLevels();;
    const hasExistingGoals = existingImmediateGoals.length > 0;
    const hasNewGoals = newImmediateGoals.length > 0;

    return (
        <div style={{
            background: 'var(--color-bg-card-alt)',
            padding: '12px 16px',
            borderTop: '1px solid var(--color-border)'
        }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: getGoalColor('ImmediateGoal') }}>◇</span>
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
                    border: `1px dashed ${getGoalColor('ImmediateGoal')}50`,
                    borderRadius: '4px',
                    color: getGoalColor('ImmediateGoal'),
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${getGoalColor('ImmediateGoal')}10`;
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
    const { getGoalColor } = useGoalLevels();;
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
                background: isSelected ? `${getGoalColor('ImmediateGoal')}15` : 'var(--color-bg-input)', // Replaced #252525
                border: `1px solid ${isSelected ? getGoalColor('ImmediateGoal') : 'var(--color-border)'}`, // Replaced #333
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
            }}
        >
            <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '3px',
                border: `2px solid ${isSelected ? getGoalColor('ImmediateGoal') : 'var(--color-border-hover)'}`, // Replaced #555
                background: isSelected ? getGoalColor('ImmediateGoal') : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a', // Keep checkmark dark for contrast on color
                fontSize: '12px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {isSelected && '✓'}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: isSelected ? getGoalColor('ImmediateGoal') : 'var(--color-text-muted)' }}>
                    {goal.name}
                </div>
                {goal.deadline && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
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
    const { getGoalColor } = useGoalLevels();;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: `${getGoalColor('ImmediateGoal')}15`,
                border: `1px solid ${getGoalColor('ImmediateGoal')}`,
                borderRadius: '4px'
            }}
        >
            <span style={{ fontSize: '12px', color: '#4caf50' }}>✨ New</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: getGoalColor('ImmediateGoal') }}>
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
